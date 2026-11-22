/** A piece of model output. */
export type OutputPart =
  | { readonly kind: 'text'; readonly text: string }
  /** Part of the model's thinking (`<think>…</think>`), streamed as it arrives. */
  | { readonly kind: 'reasoning'; readonly text: string }
  /** The thinking block is closed. */
  | { readonly kind: 'reasoning-end' }
  /** The raw body so far of a tool call the model is still writing. */
  | { readonly kind: 'tool-call-partial'; readonly raw: string }
  /** The raw body of one tool call, emitted when the call is complete. */
  | { readonly kind: 'tool-call'; readonly raw: string }
  /** A tool call the output ended in the middle of, for example at the token limit. */
  | { readonly kind: 'tool-call-cut'; readonly raw: string };

/**
 * Formats small models use. Tool calls: a ```tool_call fence or Qwen/Hermes <tool_call>
 * tags. Thinking: Qwen3/DeepSeek <think> tags. A ```tool_result fence is dropped.
 */
const BLOCKS = [
  { kind: 'tool-call', open: '```tool_call', close: '```' },
  // Tool results are written by the agent. A model that writes one is echoing: never shown.
  { kind: 'tool-result', open: '```tool_result', close: '```' },
  { kind: 'tool-call', open: '<tool_call>', close: '</tool_call>' },
  { kind: 'reasoning', open: '<think>', close: '</think>' },
] as const;

type Block = (typeof BLOCKS)[number];

/**
 * Splits streamed model output into text, thinking and tool calls. Text is passed on as
 * soon as it cannot be the start of a block, so block syntax never shows up in the chat.
 *
 * The agent reads every reply with it (thinking → `REASONING_*`, tool calls → `TOOL_CALL_*`),
 * and so do the compaction and tool calling, to keep thinking out of summaries and arguments.
 * It is in the core so a chat without AG-UI can split thinking from the answer too.
 */
export class OutputParser {
  #buffer = '';
  #inside: Block | undefined;

  /** Feeds the next text fragment and returns the parts that are complete. */
  push(fragment: string): OutputPart[] {
    this.#buffer += fragment;
    const parts: OutputPart[] = [];

    for (;;) {
      const block = this.#inside;
      if (block) {
        const end = this.#buffer.indexOf(block.close);
        if (block.kind === 'tool-call') {
          if (end === -1) {
            // Report the body so far, without a possible start of the closing tag.
            const upTo =
              this.#buffer.length - partialEnd(this.#buffer, [block.close]);
            const raw = this.#buffer.slice(0, upTo).trim();
            if (raw) parts.push({ kind: 'tool-call-partial', raw });
            return parts;
          }
          parts.push({
            kind: 'tool-call',
            raw: this.#buffer.slice(0, end).trim(),
          });
        } else if (block.kind === 'tool-result') {
          if (end === -1) {
            // Drop what arrived, keeping only a possible start of the closing fence.
            this.#buffer = this.#buffer.slice(
              this.#buffer.length - partialEnd(this.#buffer, [block.close]),
            );
            return parts;
          }
        } else {
          // Stream thinking right away, holding back only a possible start of </think>.
          const upTo =
            end === -1
              ? this.#buffer.length - partialEnd(this.#buffer, [block.close])
              : end;
          add(parts, 'reasoning', this.#buffer.slice(0, upTo));
          if (end === -1) {
            this.#buffer = this.#buffer.slice(upTo);
            return parts;
          }
          parts.push({ kind: 'reasoning-end' });
        }
        this.#buffer = this.#buffer.slice(end + block.close.length);
        this.#inside = undefined;
        continue;
      }

      const start = this.#findOpening();
      if (start) {
        add(parts, 'text', this.#buffer.slice(0, start.index));
        this.#buffer = this.#buffer.slice(
          start.index + start.block.open.length,
        );
        this.#inside = start.block;
        continue;
      }

      const keep = partialEnd(
        this.#buffer,
        BLOCKS.map((b) => b.open),
      );
      add(parts, 'text', this.#buffer.slice(0, this.#buffer.length - keep));
      this.#buffer = this.#buffer.slice(this.#buffer.length - keep);
      return parts;
    }
  }

  /** Call when the stream ends. An unclosed tool call is returned as `tool-call-cut`. */
  end(): OutputPart[] {
    const parts: OutputPart[] = [];
    if (this.#inside?.kind === 'tool-call') {
      parts.push({ kind: 'tool-call-cut', raw: this.#buffer.trim() });
    } else if (this.#inside?.kind === 'reasoning') {
      add(parts, 'reasoning', this.#buffer);
      parts.push({ kind: 'reasoning-end' });
    } else if (this.#inside?.kind === 'tool-result') {
      // An echoed tool result that was never closed: dropped like a closed one.
    } else {
      add(parts, 'text', this.#buffer);
    }
    this.#buffer = '';
    this.#inside = undefined;
    return parts;
  }

  #findOpening(): { index: number; block: Block } | undefined {
    let found: { index: number; block: Block } | undefined;
    for (const block of BLOCKS) {
      const index = this.#buffer.indexOf(block.open);
      if (index !== -1 && (!found || index < found.index))
        found = { index, block };
    }
    return found;
  }
}

function add(
  parts: OutputPart[],
  kind: 'text' | 'reasoning',
  text: string,
): void {
  if (text) parts.push({ kind, text });
}

/** Length of the longest ending of `text` that is the start of one of the `tags`. */
function partialEnd(text: string, tags: readonly string[]): number {
  let longest = 0;
  for (const tag of tags) {
    for (
      let length = Math.min(tag.length - 1, text.length);
      length > longest;
      length--
    ) {
      if (text.endsWith(tag.slice(0, length))) {
        longest = length;
        break;
      }
    }
  }
  return longest;
}
