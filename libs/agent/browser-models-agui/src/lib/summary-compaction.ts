import type { Message } from '@ag-ui/core';
import { OutputParser, type ChatMessage } from '@soverius-ai/browser-models';
import type { Compaction, CompactionRequest } from './compaction.ts';
import { shortenToolResults, textOf, type PromptMessage } from './prompt.ts';

/** All sizes are shares of the model's context, so they fit a model with 4096 tokens or 128000. */
export interface SummaryCompactionOptions {
  /**
   * Compact when the prompt fills more than this share of the model's context. The rest is
   * room for the reply. Default 0.9.
   */
  readonly threshold?: number;
  /**
   * How much of the newest conversation stays word for word, as a share of the context. What
   * is older becomes the summary. Default 0.25.
   */
  readonly keepRecent?: number;
  /**
   * Replace older turns with a summary the model writes: one extra model call, and the summary
   * is kept for the next runs of the thread. `false` leaves older turns out without a summary.
   * Default true.
   */
  readonly summarize?: boolean;
  /**
   * Characters per token, to estimate the size of the prompt. Default 3, which is careful for
   * English and code. Use 1 for Chinese, Japanese or Korean.
   */
  readonly charactersPerToken?: number;
}

/** Where a thread was cut. */
interface Cut {
  /** The id of the first message that stays as it is. */
  readonly firstKeptId: string;
  /** Stands for the turns before it. Not set when they were left out. */
  readonly summary: string | undefined;
}

const MAX_THREADS = 100;
/** Measured characters per token are trusted from calls this long on, and kept in bounds. */
const MIN_MEASURED_TOKENS = 64;
const MIN_PER_TOKEN = 1;
const MAX_PER_TOKEN = 8;
/** The summary may take this share of the context, and never more than `MAX_SUMMARY_TOKENS`. */
const SUMMARY_SHARE = 0.08;
const MAX_SUMMARY_TOKENS = 600;
/** How much of one message goes into the text the model summarizes. */
const ENTRY_SHARE = 0.05;
/** How much of a tool result stays when it is cut. */
const RESULT_SHARE = 0.025;
/** Older turns smaller than this share of the context are not worth a model call. */
const WORTH_SUMMARIZING = 0.05;

const SUMMARY_SYSTEM =
  'You summarize conversations. Do not continue the conversation and do not answer its questions. Write only the summary.';
const SUMMARY_FORMAT = [
  'Goal: what the user wants',
  'Facts: names, numbers, decisions and what tools returned',
  'Open: what is still to do, or "nothing"',
].join('\n');
const SUMMARY_FIRST =
  'Summarize the conversation above so that another assistant can continue it.';
const SUMMARY_UPDATE =
  'The conversation above is new. Update the previous summary with it: keep what is still true and add what is new.';
const SUMMARY_PREFIX =
  'The conversation before this point was compacted into this summary:\n<summary>\n';
const SUMMARY_SUFFIX = '\n</summary>';

/**
 * The compaction of the pi coding agent, with sizes for small models:
 *
 * 1. The newest turns stay word for word, up to `keepRecent` of the context. The cut is always
 *    at a user message, so a turn stays whole and the chat still starts with the user.
 * 2. The turns before the cut become a summary the model writes. The cut and its summary are
 *    kept by thread: the next model calls reuse them, and a later compaction updates the
 *    summary with the turns since. Without a summary (switched off, or the model failed) those
 *    turns are left out.
 * 3. If one turn alone is too large, its tool results are cut, oldest first. pi writes a second
 *    summary here; that is one more model call in the middle of a run, too slow in a browser.
 *
 * The current turn is never left out: the model needs the question it answers.
 */
export class SummaryCompaction implements Compaction {
  readonly #threshold: number;
  readonly #keepRecent: number;
  readonly #summarize: boolean;
  readonly #charactersPerToken: number;
  /** The last cut of every thread. */
  readonly #cuts = new RecentThreads<Cut>();
  /** Characters per token of every thread, as the engine counted them. */
  readonly #measured = new RecentThreads<number>();

  constructor(options: SummaryCompactionOptions = {}) {
    this.#threshold = options.threshold ?? 0.9;
    this.#keepRecent = options.keepRecent ?? 0.25;
    this.#summarize = options.summarize ?? true;
    this.#charactersPerToken = options.charactersPerToken ?? 3;
  }

  async compact(request: CompactionRequest): Promise<readonly ChatMessage[]> {
    const { engine, messages, threadId, report } = request;
    const contextWindowSize = engine.contextWindowSize;
    // Unknown, or -1: WebLLM's value for a sliding window, which WebLLM manages itself.
    if (!contextWindowSize || contextWindowSize < 0) return messages;
    const limit = contextWindowSize * this.#threshold;
    const count = new TokenCount(this.#perToken(threadId, request.lastCall));

    let { from, summary } = this.#lastCut(threadId, messages);
    let chat = compose(messages, from, summary);
    const tokensBefore = count.of(chat);
    if (tokensBefore <= limit) return chat;

    const cut = this.#cutPoint(
      messages,
      from,
      this.#keep(chat, limit, contextWindowSize, count),
      count,
    );
    const older = messages.slice(from, cut);
    const firstKeptId = messages[cut]?.source?.id;
    let summarized = 0;
    let dropped = 0;
    if (firstKeptId && older.length > 0) {
      const worth = count.of(older) >= contextWindowSize * WORTH_SUMMARIZING;
      let text: string | undefined;
      if (this.#summarize && worth) {
        report({
          status: 'summarizing',
          tokens: tokensBefore,
          contextWindowSize,
        });
        text = await this.#writeSummary(
          older,
          summary,
          request,
          contextWindowSize,
          count,
        );
      }
      // A few short turns stay as they are. Without a summary (switched off, or the model
      // failed) the older turns are left out: the run can still answer.
      if (worth || !this.#summarize) {
        from = cut;
        summary = text ?? summary;
        this.#cuts.set(threadId, { firstKeptId, summary });
        chat = compose(messages, from, summary);
        if (text) summarized = older.length;
        else dropped = older.length;
      }
    }

    const shortened = this.#shortenToolResults(
      chat,
      limit,
      Math.floor(contextWindowSize * RESULT_SHARE * count.perToken),
      count,
    );
    if (summarized + dropped + shortened > 0) {
      report({
        status: 'done',
        tokensBefore,
        tokensAfter: count.of(chat),
        contextWindowSize,
        summarized,
        shortened,
        dropped,
      });
    }
    return chat;
  }

  /** Where the thread was cut before: an index into `messages`, and what stands for the rest. */
  #lastCut(
    threadId: string,
    messages: readonly PromptMessage[],
  ): { from: number; summary: string | undefined } {
    const cut = this.#cuts.get(threadId);
    const from = cut
      ? messages.findIndex((message) => message.source?.id === cut.firstKeptId)
      : -1;
    // A cut whose first kept message is gone (the user edited the thread) is not used.
    if (!cut || from < 0)
      return {
        from: messages[0]?.role === 'system' ? 1 : 0,
        summary: undefined,
      };
    return { from, summary: cut.summary };
  }

  /**
   * Characters per token for the estimate. The option, until the engine counted a call of the
   * thread: then what it counted, so the estimate fits the model and the language.
   */
  #perToken(threadId: string, lastCall: CompactionRequest['lastCall']): number {
    // A short call says little: the chat template weighs too much in it.
    if (lastCall && lastCall.tokens >= MIN_MEASURED_TOKENS) {
      const measured = lastCall.characters / lastCall.tokens;
      this.#measured.set(
        threadId,
        Math.min(MAX_PER_TOKEN, Math.max(MIN_PER_TOKEN, measured)),
      );
    }
    return this.#measured.get(threadId) ?? this.#charactersPerToken;
  }

  /**
   * How many tokens of the newest turns stay: `keepRecent`, but never more than half of the
   * room the conversation has. With a small context the system prompt and the tool
   * descriptions take most of it.
   */
  #keep(
    chat: readonly ChatMessage[],
    limit: number,
    contextWindowSize: number,
    count: TokenCount,
  ): number {
    const [first] = chat;
    const systemTokens = first?.role === 'system' ? count.of([first]) : 0;
    const room = limit - systemTokens - summaryTokens(contextWindowSize);
    return Math.max(
      0,
      Math.min(contextWindowSize * this.#keepRecent, room / 2),
    );
  }

  /**
   * The index of the first message that stays as it is. Like pi: walk back from the newest
   * message until `keep` tokens are collected, then cut at the next user message. Returns
   * `from` when there is nothing to cut off.
   */
  #cutPoint(
    messages: readonly PromptMessage[],
    from: number,
    keep: number,
    count: TokenCount,
  ): number {
    // Only a message of the user starts a turn: a tool result has the role `user` as well.
    const startsTurn = messages.map(
      (message) => message.source?.role === 'user',
    );
    let tokens = 0;
    for (let i = messages.length - 1; i >= from; i--) {
      tokens += count.of(messages.slice(i, i + 1));
      if (tokens < keep) continue;
      const nextTurn = startsTurn.indexOf(true, i);
      // No user message from here on: `i` is in the current turn, which always stays whole.
      return nextTurn >= 0
        ? nextTurn
        : Math.max(from, startsTurn.lastIndexOf(true));
    }
    return from;
  }

  /** Lets the model write the summary of `older`, on top of the summary there is. */
  async #writeSummary(
    older: readonly PromptMessage[],
    previous: string | undefined,
    { engine, signal }: CompactionRequest,
    contextWindowSize: number,
    count: TokenCount,
  ): Promise<string | undefined> {
    const contextLength = contextWindowSize * count.perToken;
    const summaryLength = Math.floor(
      summaryTokens(contextWindowSize) * count.perToken,
    );
    // About 7 characters per word, rounded down to tens.
    const words = Math.max(30, Math.floor(summaryLength / 70) * 10);
    const request = [
      ...(previous
        ? [`<previous-summary>\n${previous}\n</previous-summary>`]
        : []),
      `${previous ? SUMMARY_UPDATE : SUMMARY_FIRST} Use at most ${words} words and this format:`,
      SUMMARY_FORMAT,
    ].join('\n\n');

    const lines = transcript(
      older.flatMap((message) => message.source ?? []),
      Math.floor(contextLength * ENTRY_SHARE),
    );
    // The request and the summary have to fit into the context too: leave out the oldest lines.
    const room =
      contextLength - summaryLength - request.length - SUMMARY_SYSTEM.length;
    while (lines.length > 1 && lines.join('\n\n').length > room) lines.shift();

    // Same parser as the answers, so thinking (<think>…</think>) is not part of the summary.
    const parser = new OutputParser();
    let text = '';
    try {
      for await (const fragment of engine.generate({
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM },
          {
            role: 'user',
            // As text in tags, so the model does not take it for a conversation to continue.
            content: `<conversation>\n${lines.join('\n\n')}\n</conversation>\n\n${request}`,
          },
        ],
        signal,
      })) {
        if (fragment.type !== 'text') continue;
        for (const part of parser.push(fragment.text))
          if (part.kind === 'text') text += part.text;
      }
      for (const part of parser.end())
        if (part.kind === 'text') text += part.text;
    } catch (error) {
      if (signal.aborted) throw error;
      return undefined;
    }
    signal.throwIfAborted();
    // A summary must not be the next thing that fills the context.
    return text.trim().slice(0, summaryLength) || undefined;
  }

  /**
   * Cuts the tool results in `chat` to `length` characters, oldest first, until the chat fits.
   * Returns how many messages changed.
   */
  #shortenToolResults(
    chat: ChatMessage[],
    limit: number,
    length: number,
    count: TokenCount,
  ): number {
    let changed = 0;
    for (const [index, message] of chat.entries()) {
      const excess = count.of(chat) - limit;
      if (excess <= 0) break;
      // The newest message is what the model has to read now: it keeps what there is room for.
      const room =
        index === chat.length - 1
          ? (count.of([message]) - excess) * count.perToken
          : 0;
      let content = message.content;
      // The block around a result and its escaping take room as well, so try smaller and smaller.
      for (let size = room; ; size = Math.floor(size * 0.8)) {
        content = shortenToolResults(message.content, Math.max(length, size));
        chat[index] = { ...message, content };
        if (size <= length || count.of(chat) <= limit) break;
      }
      if (content !== message.content) changed++;
    }
    return changed;
  }
}

/**
 * The prompt with the messages before `from` replaced by the summary, which goes to the end of
 * the system prompt.
 */
function compose(
  messages: readonly PromptMessage[],
  from: number,
  summary: string | undefined,
): ChatMessage[] {
  const [first] = messages;
  const system = [
    first?.role === 'system' ? first.content : '',
    summary ? SUMMARY_PREFIX + summary + SUMMARY_SUFFIX : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return [
    ...(system ? [{ role: 'system' as const, content: system }] : []),
    ...messages.slice(from),
  ];
}

function summaryTokens(contextWindowSize: number): number {
  return Math.min(MAX_SUMMARY_TOKENS, contextWindowSize * SUMMARY_SHARE);
}

/** The messages as lines of text for the model to summarize, each cut to `length` characters. */
function transcript(messages: readonly Message[], length: number): string[] {
  const lines: string[] = [];
  const line = (label: string, text: string) => {
    if (text) lines.push(`[${label}]: ${text.slice(0, length)}`);
  };
  for (const message of messages) {
    if (message.role === 'user') line('User', textOf(message.content));
    if (message.role === 'tool')
      line('Tool result', message.error ?? textOf(message.content));
    if (message.role === 'assistant') {
      line('Assistant', message.content ?? '');
      for (const call of message.toolCalls ?? [])
        line(
          'Assistant tool call',
          `${call.function.name}(${call.function.arguments})`,
        );
    }
  }
  return lines;
}

/** An estimate: engines do not offer their tokenizers in the same way, or at all. */
class TokenCount {
  readonly perToken: number;

  constructor(perToken: number) {
    this.perToken = perToken;
  }

  of(messages: readonly ChatMessage[]): number {
    return messages.reduce(
      // A few tokens per message for the role and the chat template.
      (sum, message) =>
        sum + Math.ceil(message.content.length / this.perToken) + 4,
      0,
    );
  }
}

/** A value per thread, for the last `MAX_THREADS` threads that changed. */
class RecentThreads<Value> {
  readonly #values = new Map<string, Value>();

  get(threadId: string): Value | undefined {
    return this.#values.get(threadId);
  }

  set(threadId: string, value: Value): void {
    this.#values.delete(threadId);
    this.#values.set(threadId, value);
    // A page that opens thread after thread must not collect them without end.
    const oldest = this.#values.keys().next().value;
    if (this.#values.size > MAX_THREADS && oldest !== undefined)
      this.#values.delete(oldest);
  }
}
