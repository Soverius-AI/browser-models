import {
  OutputParser,
  type ChatMessage,
  type Engine,
  type Usage,
} from '@soverius-ai/browser-models';

/** What the page shows while a reply streams. */
export interface ReplyView {
  text(delta: string): void;
  /** Thinking the model wrote in `<think>` tags, before its answer. */
  thinking(delta: string): void;
  /** Why the reply ended, and the tokens the engine counted. */
  finished(reason: 'stop' | 'length', usage: Usage | undefined): void;
}

/**
 * A chat straight on an engine: the history, one streamed reply at a time, and stop. Engines
 * keep no history of their own, so every call gets the whole conversation.
 */
export class Conversation {
  readonly #history: ChatMessage[] = [
    { role: 'system', content: 'You are a helpful assistant. Answer briefly.' },
  ];
  #stop: AbortController | undefined;

  /** The conversation so far, system prompt included. */
  get history(): readonly ChatMessage[] {
    return this.#history;
  }

  get replying(): boolean {
    return this.#stop !== undefined;
  }

  /** Sends a message and streams the reply into `view`. Resolves when the reply ends. */
  async send(engine: Engine, text: string, view: ReplyView): Promise<void> {
    this.#history.push({ role: 'user', content: text });
    const stop = new AbortController();
    this.#stop = stop;
    // Splits `<think>` blocks from the answer, while the text streams.
    const parser = new OutputParser();
    let answer = '';
    const show = (parts: ReturnType<OutputParser['push']>) => {
      for (const part of parts) {
        if (part.kind === 'text') {
          answer += part.text;
          view.text(part.text);
        }
        if (part.kind === 'reasoning') view.thinking(part.text);
      }
    };
    try {
      for await (const part of engine.generate({
        messages: this.#history,
        signal: stop.signal,
      })) {
        if (part.type === 'text') show(parser.push(part.text));
        else view.finished(part.reason, part.usage);
      }
      show(parser.end());
    } catch (error) {
      if (!stop.signal.aborted) throw error;
    } finally {
      this.#stop = undefined;
      // Keep what arrived, also of a stopped reply, so the model sees what it said.
      this.#history.push({ role: 'assistant', content: answer });
    }
  }

  /** Stops the reply that is streaming. */
  stop(): void {
    this.#stop?.abort();
  }
}
