import type {
  Availability,
  ChatMessage,
  Engine,
  GenerateRequest,
  LoadOptions,
} from '../lib/engine.ts';
import { SharedLoad } from './shared-load.ts';

/** The part of the browser's built-in `LanguageModel` API (Chrome, Edge) this engine uses. */
export interface LanguageModelApi {
  availability(options?: LanguageModelExpectations): Promise<Availability>;
  create(
    options?: LanguageModelExpectations & {
      initialPrompts?: readonly ChatMessage[];
      signal?: AbortSignal;
      monitor?: (monitor: EventTarget) => void;
    },
  ): Promise<LanguageModelSession>;
}

/** The languages a session reads and writes. Chrome checks support for them up front. */
export interface LanguageModelExpectations {
  expectedInputs?: readonly { type: 'text'; languages: readonly string[] }[];
  expectedOutputs?: readonly { type: 'text'; languages: readonly string[] }[];
}

export interface LanguageModelSession {
  promptStreaming(
    input: string,
    options?: { signal?: AbortSignal; responseConstraint?: unknown },
  ): ReadableStream<string>;
  destroy(): void;
}

export interface PromptApiOptions {
  /** Languages of the conversation, for example `['en', 'de']`. Default `['en']`. */
  readonly languages?: readonly string[];
  /** The API to use. Defaults to the browser's global `LanguageModel`. */
  readonly languageModel?: LanguageModelApi;
}

/**
 * Engine for the model built into the browser: Gemini Nano in Chrome, Phi-4-mini in Edge.
 * The browser downloads, stores and removes the model itself, so there is no `delete()`.
 * `load()` may need a user gesture.
 */
export class PromptApiEngine implements Engine {
  readonly id = 'prompt-api';
  readonly supportsConstraint = true;
  readonly #languageModel: LanguageModelApi | undefined;
  readonly #expectations: LanguageModelExpectations;
  readonly #download: SharedLoad<void>;
  /** The session of the last finished turn, kept for the next turn of the same conversation. */
  #cached: CachedSession | undefined;

  constructor(options: PromptApiOptions = {}) {
    const languages = options.languages ?? ['en'];
    this.#languageModel = options.languageModel;
    this.#expectations = {
      expectedInputs: [{ type: 'text', languages }],
      expectedOutputs: [{ type: 'text', languages }],
    };
    this.#download = new SharedLoad(
      (onProgress, signal) => this.#startDownload(onProgress, signal),
      async () => undefined, // the browser keeps the model, there is nothing to free
    );
  }

  async availability(): Promise<Availability> {
    const api = this.#api();
    return api ? api.availability(this.#expectations) : 'unavailable';
  }

  async load(options?: LoadOptions): Promise<void> {
    await this.#download.get(options);
  }

  /** Stops a download this page is waiting for and destroys the kept session. */
  async unload(): Promise<void> {
    await this.#download.reset();
    this.#cached?.session.destroy();
    this.#cached = undefined;
  }

  async *generate({
    messages,
    constraint,
    signal,
  }: GenerateRequest): AsyncGenerator<string> {
    const last = messages.at(-1);
    if (last?.role !== 'user') {
      throw new Error(
        'The last message sent to the Prompt API must be from the user.',
      );
    }
    const history = messages.slice(0, -1);
    // Reuse the last session when it already holds exactly this history: the browser then
    // only reads the new message instead of the whole conversation again.
    const previous = this.#cached;
    const reuse =
      previous && !previous.busy && sameMessages(previous.history, history);
    if (previous && !previous.busy && !reuse) previous.session.destroy();
    const session = reuse
      ? previous.session
      : await this.#requiredApi().create({
          ...this.#expectations,
          initialPrompts: history,
          ...(signal ? { signal } : {}),
        });
    const entry: CachedSession = { session, history, busy: true };
    this.#cached = entry;

    let reply = '';
    let completed = false;
    try {
      const stream = session.promptStreaming(last.content, {
        ...(signal ? { signal } : {}),
        ...(constraint ? { responseConstraint: constraint } : {}),
      });
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += value;
        yield value;
      }
      // An aborted stream normally fails by itself; make sure the caller always sees the abort.
      signal?.throwIfAborted();
      entry.history = [...history, last, { role: 'assistant', content: reply }];
      completed = true;
    } finally {
      entry.busy = false;
      // Keep only a finished session that is still the cached one; an interrupted session
      // has an unknown history. Destroying it also stops the browser from generating.
      if (!completed || this.#cached !== entry) {
        session.destroy();
        if (this.#cached === entry) this.#cached = undefined;
      }
    }
  }

  /** Creating a session starts the browser's download; this may need a user gesture. */
  async #startDownload(
    onProgress: (fraction: number) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const api = this.#requiredApi();
    if ((await api.availability(this.#expectations)) === 'available') return;
    const session = await api.create({
      ...this.#expectations,
      signal,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) =>
          onProgress((event as ProgressEvent).loaded),
        );
      },
    });
    session.destroy();
  }

  /** Looked up on use, so the engine can be created where the API is missing (SSR). */
  #api(): LanguageModelApi | undefined {
    return (
      this.#languageModel ??
      (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel
    );
  }

  #requiredApi(): LanguageModelApi {
    const api = this.#api();
    if (!api)
      throw new Error(
        'The Prompt API (LanguageModel) is not available in this browser.',
      );
    return api;
  }
}

interface CachedSession {
  readonly session: LanguageModelSession;
  history: readonly ChatMessage[];
  busy: boolean;
}

function sameMessages(
  a: readonly ChatMessage[],
  b: readonly ChatMessage[],
): boolean {
  return (
    a.length === b.length &&
    a.every((message, i) => {
      const other = b[i];
      return (
        other !== undefined &&
        message.role === other.role &&
        message.content.trim() === other.content.trim()
      );
    })
  );
}
