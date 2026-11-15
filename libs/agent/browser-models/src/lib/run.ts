import {
  EventType,
  type Event as AgUiEvent,
  type Message,
  type RunAgentInput,
  type ToolCall as MessageToolCall,
} from '@ag-ui/core';
import { AsyncQueue } from './async-queue.ts';
import type { Compaction, CompactionStatus } from './compaction.ts';
import type { ChatMessage, Engine } from './engine.ts';
import { OutputParser, type OutputPart } from './parser.ts';
import {
  buildChatMessages,
  toolCallBlock,
  toolResultBlock,
  type PromptMessage,
} from './prompt.ts';
import { ToolCallRepair, type RepairOptions } from './repair.ts';
import {
  resolveLocalTools,
  type LocalTool,
  type LocalToolSource,
  type ToolSpec,
} from './tools.ts';

export interface RunOptions {
  readonly engine: Engine;
  readonly input: RunAgentInput;
  /**
   * Tools that run inside the agent, or sources of them (read at the start of the run).
   * Tools in `input.tools` are frontend tools, run by the client.
   */
  readonly localTools?: readonly (LocalTool | LocalToolSource)[];
  /** Most model calls in one run, counting re-tries after tool results. Default 5. */
  readonly maxSteps?: number;
  /** Optional last-chance repair hook. */
  readonly repairHook?: RepairOptions['hook'];
  /** Keeps the conversation within the model's context. Without it nothing is compacted. */
  readonly compaction?: Compaction;
  readonly signal?: AbortSignal;
}

/** `activityType` of the model loading events. */
export const MODEL_ACTIVITY = 'soverius.model';

const CUT_OFF =
  'The tool call was cut off before it was complete. Send the whole call again.';

/** A tool call the client has a TOOL_CALL_START for, but no TOOL_CALL_END yet. */
interface OpenCall {
  readonly id: string;
  readonly name: string;
  /** The arguments JSON sent so far. */
  sent: string;
}

/** A tool call the model has finished writing. */
interface WrittenCall {
  readonly raw: string;
  /** Set when the call was already streamed to the client. */
  readonly streamed: OpenCall | undefined;
  /** The output ended in the middle of the call. */
  readonly cut: boolean;
}

/**
 * One AG-UI run against a browser engine. `events()` yields its AG-UI events.
 *
 * - Text is streamed as TEXT_MESSAGE_* events.
 * - A tool call is streamed while the model writes it: TOOL_CALL_START when the name is
 *   known, then TOOL_CALL_ARGS deltas.
 * - Every tool call is repaired once it is complete (see ToolCallRepair). AG-UI cannot take
 *   back arguments that were sent, so the call stays open until it is repaired. When the
 *   repaired call continues what was sent, the rest follows as a delta. If not, a
 *   MESSAGES_SNAPSHOT replaces the call (or removes it, when it cannot be repaired). Only then
 *   comes TOOL_CALL_END, so at TOOL_CALL_END the client always holds the repaired call.
 * - Local tools run here and the loop continues with their result.
 * - Before every model call the compaction may cut the chat to fit the model's context (see
 *   Compaction).
 * - A frontend tool call ends the run: the client runs it and starts a follow-up run.
 */
export class AgentRun {
  readonly #options: RunOptions;
  readonly #signal: AbortSignal;
  /** What this run added to the conversation, with repaired tool calls only. */
  readonly #produced: Message[] = [];
  readonly #open = new Set<OpenCall>();

  constructor(options: RunOptions) {
    this.#options = options;
    this.#signal = options.signal ?? new AbortController().signal;
  }

  /** Runs the run. Call it once. */
  async *events(): AsyncGenerator<AgUiEvent> {
    const { threadId, runId } = this.#options.input;
    yield { type: EventType.RUN_STARTED, threadId, runId };
    try {
      yield* this.#steps();
      yield { type: EventType.RUN_FINISHED, threadId, runId };
    } catch (error) {
      // Calls that were never repaired must not stay with the client, or open.
      if (this.#open.size > 0) yield this.#snapshot();
      for (const call of this.#open) {
        yield { type: EventType.TOOL_CALL_END, toolCallId: call.id };
      }
      if (this.#signal.aborted) {
        // Same code as @ag-ui/client's HttpAgent.
        yield {
          type: EventType.RUN_ERROR,
          message: 'The run was stopped.',
          code: 'abort',
        };
      } else {
        const message = error instanceof Error ? error.message : String(error);
        yield { type: EventType.RUN_ERROR, message };
      }
    }
  }

  async *#steps(): AsyncGenerator<AgUiEvent> {
    const { engine, input } = this.#options;
    const signal = this.#signal;

    // A client tool wins over a local tool of the same name (CopilotKit can also publish its
    // tools to WebMCP, so the same tool may arrive both ways).
    const clientNames = new Set(input.tools.map((tool) => tool.name));
    const resolved = await resolveLocalTools(
      this.#options.localTools ?? [],
      signal,
    );
    for (const message of resolved.errors) {
      yield {
        type: EventType.CUSTOM,
        name: 'soverius.tool_source_error',
        value: { message },
      };
    }
    const localTools = resolved.tools.filter(
      (tool) => !clientNames.has(tool.name),
    );
    const tools: ToolSpec[] = [...input.tools, ...localTools];
    // The whole conversation, plus the tool calls and results this run adds.
    const chat = buildChatMessages(input.messages, input.context, tools);
    // What the model gets in the current step.
    let prompt: readonly ChatMessage[] = [];
    const repair = new ToolCallRepair(tools, {
      reask: (tool, error, raw) => this.#reask(prompt, raw, tool, error),
      ...(this.#options.repairHook ? { hook: this.#options.repairHook } : {}),
    });

    yield* this.#loadModel();
    signal.throwIfAborted();

    for (let step = 0; step < (this.#options.maxSteps ?? 5); step++) {
      prompt = yield* this.#compact(chat);
      const reply = new ReplyStream(repair, this.#open);
      const { message } = reply;
      this.#produced.push(message);
      const parser = new OutputParser();

      for await (const fragment of engine.generate({
        messages: prompt,
        signal,
      })) {
        yield* reply.events(parser.push(fragment));
      }
      // Not every engine throws when it is stopped. A stopped call must not be repaired or run.
      signal.throwIfAborted();
      yield* reply.events(parser.end());
      if (message.content) {
        yield { type: EventType.TEXT_MESSAGE_END, messageId: message.id };
      }

      if (reply.calls.length === 0) return;

      const assistantTurn: string[] = message.content ? [message.content] : [];
      const results: string[] = [];
      let frontendCalled = false;

      for (const { raw, streamed, cut } of reply.calls) {
        signal.throwIfAborted();
        // A call that was cut off is not guessed at: half the arguments may be missing.
        const repaired = cut
          ? { ok: false as const, error: CUT_OFF }
          : await repair.repair(raw);
        // A stopped re-ask counts as failed in ToolCallRepair; stop here instead.
        signal.throwIfAborted();

        if (!repaired.ok) {
          if (streamed) {
            // Take the call back from the client.
            yield this.#snapshot();
            yield { type: EventType.TOOL_CALL_END, toolCallId: streamed.id };
            this.#open.delete(streamed);
          }
          // Tell the model what was wrong and let it try again in the next step.
          assistantTurn.push('```tool_call\n' + raw + '\n```');
          results.push(toolResultBlock('error', repaired.error));
          continue;
        }

        const { call, steps } = repaired;
        const toolCallId = streamed?.id ?? crypto.randomUUID();
        const argumentsJson = JSON.stringify(call.arguments);
        message.toolCalls.push({
          id: toolCallId,
          type: 'function',
          function: { name: call.name, arguments: argumentsJson },
        });
        if (steps.length > 0) {
          yield {
            type: EventType.CUSTOM,
            name: 'soverius.tool_repair',
            value: { toolCallId, raw, steps },
          };
        }
        if (!streamed) {
          // The name was only known with the complete call (for example it came after the
          // arguments, or the repair hook supplied it), so the call starts here.
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId,
            toolCallName: call.name,
            parentMessageId: message.id,
          };
        }
        const delta = rest(argumentsJson, streamed?.sent ?? '');
        if (streamed && (streamed.name !== call.name || delta === undefined)) {
          // Repair changed what the client already has: replace it.
          yield this.#snapshot();
        } else if (delta) {
          yield { type: EventType.TOOL_CALL_ARGS, toolCallId, delta };
        }
        yield { type: EventType.TOOL_CALL_END, toolCallId };
        if (streamed) this.#open.delete(streamed);
        assistantTurn.push(toolCallBlock(call.name, argumentsJson));

        const local = localTools.find((tool) => tool.name === call.name);
        if (!local) {
          frontendCalled = true;
          continue;
        }
        signal.throwIfAborted();
        const result = await this.#runLocalTool(local, call.arguments);
        const resultId = crypto.randomUUID();
        this.#produced.push({
          id: resultId,
          role: 'tool',
          toolCallId,
          content: result,
        });
        yield {
          type: EventType.TOOL_CALL_RESULT,
          messageId: resultId,
          toolCallId,
          content: result,
          role: 'tool',
        };
        results.push(toolResultBlock(call.name, result));
      }

      if (frontendCalled) return;
      chat.push(
        { role: 'assistant', content: assistantTurn.join('\n') },
        { role: 'user', content: results.join('\n') },
      );
    }
  }

  /**
   * The prompt for the next model call: the chat, as the compaction returns it. What the
   * compaction reports goes to the client as `soverius.compaction` events while it works.
   */
  async *#compact(
    chat: readonly PromptMessage[],
  ): AsyncGenerator<AgUiEvent, readonly ChatMessage[]> {
    const { compaction, engine, input } = this.#options;
    if (!compaction) return chat.map(plain);
    const reports = new AsyncQueue<CompactionStatus>();
    const compacted = compaction.compact({
      threadId: input.threadId,
      messages: chat,
      engine,
      signal: this.#signal,
      report: (status) => reports.push(status),
    });
    compacted.then(
      () => reports.close(),
      (error: unknown) => reports.fail(error),
    );
    for await (const value of reports) {
      yield { type: EventType.CUSTOM, name: 'soverius.compaction', value };
    }
    return (await compacted).map(plain);
  }

  /**
   * Everything the client should hold now: the messages it sent plus what this run produced.
   * The client replaces its messages with these, which is the only way in AG-UI to change or
   * remove a tool call that was already streamed.
   */
  #snapshot(): AgUiEvent {
    return {
      type: EventType.MESSAGES_SNAPSHOT,
      // A copy: the client changes the messages it holds.
      messages: structuredClone([
        // The client keeps its activity and reasoning messages when the snapshot has none.
        ...this.#options.input.messages.filter(
          (message) =>
            message.role !== 'activity' && message.role !== 'reasoning',
        ),
        ...this.#produced.filter(
          (message) =>
            message.role !== 'assistant' ||
            message.content ||
            message.toolCalls?.length,
        ),
      ]),
    };
  }

  /**
   * Loads the model before the first answer. While the engine reports progress, emits
   * `ACTIVITY_SNAPSHOT` events (`activityType: 'soverius.model'`, content
   * `{ engineId, status: 'loading' | 'ready', progress }`) so any AG-UI client can show it.
   * A model that is already loaded reports nothing, so the run has no extra events.
   */
  async *#loadModel(): AsyncGenerator<AgUiEvent> {
    const { engine } = this.#options;
    const messageId = crypto.randomUUID();
    const progress = new AsyncQueue<number>();
    engine
      .load({
        signal: this.#signal,
        onProgress: (fraction) => progress.push(fraction),
      })
      .then(
        () => progress.close(),
        (error: unknown) => progress.fail(error),
      );

    let reported = false;
    let lastPercent = -1;
    for await (const fraction of progress) {
      // Engines report progress very often; one event per whole percent is enough.
      const percent = Math.floor(fraction * 100);
      if (percent === lastPercent) continue;
      lastPercent = percent;
      reported = true;
      yield {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId,
        activityType: MODEL_ACTIVITY,
        content: { engineId: engine.id, status: 'loading', progress: fraction },
      };
    }
    if (reported) {
      yield {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId,
        activityType: MODEL_ACTIVITY,
        content: { engineId: engine.id, status: 'ready', progress: 1 },
      };
    }
  }

  async #runLocalTool(
    tool: LocalTool,
    args: Readonly<Record<string, unknown>>,
  ): Promise<string> {
    try {
      const result = await tool.execute({ ...args }, this.#signal);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Asks the model once for corrected arguments, forcing JSON output when the engine can. The
   * model sees its own call (`raw`) and the tool's schema. It may answer with the arguments or
   * with a whole new tool call.
   */
  async #reask(
    chat: readonly ChatMessage[],
    raw: string,
    tool: ToolSpec,
    error: string,
  ): Promise<string | undefined> {
    const { engine } = this.#options;
    const schema = JSON.stringify(tool.parameters ?? { type: 'object' });
    const request: ChatMessage = {
      role: 'user',
      content: `Your call to the tool "${tool.name}" had invalid arguments: ${error}. The arguments must match this JSON Schema: ${schema}. Reply with only the corrected arguments as one JSON object.`,
    };
    // Same parser as the main loop, so thinking (<think>…</think>) is not part of the answer.
    const parser = new OutputParser();
    let text = '';
    let call: string | undefined;
    const keep = (parts: readonly OutputPart[]) => {
      for (const part of parts) {
        if (part.kind === 'text') text += part.text;
        if (part.kind === 'tool-call') call = part.raw;
      }
    };
    for await (const fragment of engine.generate({
      messages: [
        ...chat,
        { role: 'assistant', content: '```tool_call\n' + raw + '\n```' },
        request,
      ],
      signal: this.#signal,
      ...(engine.supportsConstraint && tool.parameters
        ? { constraint: tool.parameters }
        : {}),
    })) {
      keep(parser.push(fragment));
    }
    keep(parser.end());
    return (call ?? text).trim() || undefined;
  }
}

/**
 * Turns the parts of one model reply into AG-UI events while the model is still writing:
 * text, thinking, and the start and argument deltas of tool calls. Finished calls are
 * collected in `calls`; AgentRun repairs and ends them.
 */
class ReplyStream {
  /** The assistant message of this reply, as the client should hold it. */
  readonly message = {
    id: crypto.randomUUID(),
    role: 'assistant' as const,
    content: '',
    toolCalls: [] as MessageToolCall[],
  };
  readonly calls: WrittenCall[] = [];
  readonly #repair: ToolCallRepair;
  readonly #open: Set<OpenCall>;
  /** The call the model is writing right now, once it was started. */
  #streaming: OpenCall | undefined;
  #reasoningId: string | undefined;

  constructor(repair: ToolCallRepair, open: Set<OpenCall>) {
    this.#repair = repair;
    this.#open = open;
  }

  *events(parts: readonly OutputPart[]): Generator<AgUiEvent> {
    const messageId = this.message.id;
    for (const part of parts) {
      switch (part.kind) {
        case 'tool-call-partial':
          yield* this.#streamCall(part.raw);
          break;
        case 'tool-call':
        case 'tool-call-cut':
          this.calls.push({
            raw: part.raw,
            streamed: this.#streaming,
            cut: part.kind === 'tool-call-cut',
          });
          this.#streaming = undefined;
          break;
        case 'reasoning':
          // Skip leading whitespace, for example the empty <think></think> of Qwen3.
          if (!this.#reasoningId && !part.text.trim()) break;
          if (!this.#reasoningId) {
            this.#reasoningId = crypto.randomUUID();
            yield {
              type: EventType.REASONING_START,
              messageId: this.#reasoningId,
            };
            yield {
              type: EventType.REASONING_MESSAGE_START,
              messageId: this.#reasoningId,
              role: 'reasoning',
            };
          }
          yield {
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId: this.#reasoningId,
            delta: part.text,
          };
          break;
        case 'reasoning-end':
          if (this.#reasoningId) {
            yield {
              type: EventType.REASONING_MESSAGE_END,
              messageId: this.#reasoningId,
            };
            yield {
              type: EventType.REASONING_END,
              messageId: this.#reasoningId,
            };
            this.#reasoningId = undefined;
          }
          break;
        case 'text': {
          // Drop the whitespace that models put between thinking and the answer.
          const delta = this.message.content
            ? part.text
            : part.text.trimStart();
          if (!delta) break;
          if (!this.message.content) {
            yield {
              type: EventType.TEXT_MESSAGE_START,
              messageId,
              role: 'assistant',
            };
          }
          this.message.content += delta;
          yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta };
          break;
        }
      }
    }
  }

  /** Sends what is new in the call the model is writing: its start, then argument deltas. */
  *#streamCall(raw: string): Generator<AgUiEvent> {
    const partial = this.#repair.readPartial(raw);
    if (!partial) return;
    if (!this.#streaming) {
      this.#streaming = {
        id: crypto.randomUUID(),
        name: partial.name,
        sent: '',
      };
      this.#open.add(this.#streaming);
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId: this.#streaming.id,
        toolCallName: this.#streaming.name,
        parentMessageId: this.message.id,
      };
    }
    const delta = rest(partial.argumentsJson, this.#streaming.sent);
    if (delta) {
      this.#streaming.sent += delta;
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: this.#streaming.id,
        delta,
      };
    }
  }
}

/** Engines get the role and the text of a message, and nothing else. */
function plain({ role, content }: ChatMessage): ChatMessage {
  return { role, content };
}

/** What is left of `full` after `sent`, or undefined when `full` does not start with `sent`. */
function rest(full: string, sent: string): string | undefined {
  return full.startsWith(sent) ? full.slice(sent.length) : undefined;
}
