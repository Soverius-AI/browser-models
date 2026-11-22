/// <reference types="dom-chromium-ai" preserve="true" />

import {
  EngineKind,
  type Availability,
  type ChatMessage,
  type Engine,
  type EnginePart,
  type GenerateRequest,
  type LoadOptions,
  type ModelSettings,
  type Sampling,
} from '../lib/engine.ts';
import { SharedLoad } from './shared-load.ts';

/** Native Prompt API declarations supplied by @types/dom-chromium-ai. */
export type LanguageModelApi = Pick<
  typeof LanguageModel,
  'availability' | 'create'
>;
/** The languages a session must handle, as the browser's Prompt API expects them. */
export type LanguageModelExpectations = Pick<
  LanguageModelCreateCoreOptions,
  'expectedInputs' | 'expectedOutputs'
>;
/** A Prompt API session (`LanguageModel`). */
export type LanguageModelSession = LanguageModel;

/**
 * The browser sets the context size and the reply length, so only `sampling` of the
 * `ModelSettings` applies.
 */
export interface PromptApiOptions extends Pick<ModelSettings, 'sampling'> {
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
  readonly kind = EngineKind.PromptApi;
  readonly supportsConstraint = true;
  readonly #languageModel: LanguageModelApi | undefined;
  readonly #expectations: LanguageModelExpectations;
  readonly #download: SharedLoad<void>;
  /** The session of the last finished turn, kept for the next turn of the same conversation. */
  #cached: CachedSession | undefined;
  #contextWindowSize: number | undefined;
  readonly #sampling: Sampling | undefined;

  constructor(options: PromptApiOptions = {}) {
    const languages = options.languages ?? ['en'];
    this.#languageModel = options.languageModel;
    this.#expectations = {
      expectedInputs: [{ type: 'text', languages: [...languages] }],
      expectedOutputs: [{ type: 'text', languages: [...languages] }],
    };
    this.#sampling = options.sampling;
    this.#download = new SharedLoad(
      (onProgress, signal) => this.#startDownload(onProgress, signal),
      async () => undefined, // the browser keeps the model, there is nothing to free
    );
  }

  /**
   * The browser sets the context size and only a session tells it, so it is known from the
   * first answer on.
   */
  get contextWindowSize(): number | undefined {
    return this.#contextWindowSize;
  }

  /** What the browser answers for the configured languages; `unavailable` without the Prompt API. */
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
  }: GenerateRequest): AsyncGenerator<EnginePart> {
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
          ...(this.#sampling ? { samplingMode: this.#sampling } : {}),
          initialPrompts: [...history] as NonNullable<
            LanguageModelCreateOptions['initialPrompts']
          >,
          ...(signal ? { signal } : {}),
        });
    this.#contextWindowSize = session.contextWindow ?? session.inputQuota;
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
        yield { type: 'text', text: value };
      }
      // An aborted stream normally fails by itself; make sure the caller always sees the abort.
      signal?.throwIfAborted();
      entry.history = [...history, last, { role: 'assistant', content: reply }];
      completed = true;
      const totalTokens = session.contextUsage ?? session.inputUsage;
      yield {
        type: 'finish',
        reason: 'stop',
        ...(totalTokens === undefined ? {} : { usage: { totalTokens } }),
      };
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
          onProgress(event.loaded),
        );
      },
    });
    session.destroy();
  }

  /** Looked up on use, so the engine can be created where the API is missing (SSR). */
  #api(): LanguageModelApi | undefined {
    return (
      this.#languageModel ??
      (typeof LanguageModel === 'undefined' ? undefined : LanguageModel)
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
