/** The engines of this library. `engine.kind` tells which one an engine is. */
export enum EngineKind {
  PromptApi = 'prompt-api',
  WebLlm = 'web-llm',
  TransformersJs = 'transformers',
}

/** Whether a model can be used right now, needs a download first, or cannot run on this device. */
export type Availability =
  'available' | 'downloadable' | 'downloading' | 'unavailable';

/** One message in the plain chat format that engines understand. */
export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/** A JSON Schema object, as used for tool arguments. */
export type JsonSchema = Readonly<Record<string, unknown>>;

/** Options of `Engine.load()`. */
export interface LoadOptions {
  /** Download or load progress from 0 to 1. */
  readonly onProgress?: (fraction: number) => void;
  readonly signal?: AbortSignal;
}

/** What `Engine.generate()` gets. */
export interface GenerateRequest {
  readonly messages: readonly ChatMessage[];
  /** Force the output to match this JSON Schema. Only used when `supportsConstraint` is true. */
  readonly constraint?: JsonSchema;
  readonly signal?: AbortSignal;
}

/**
 * How freely the model picks its words, from always the likeliest word to very varied. These
 * are the levels of the Prompt API; WebLLM and transformers.js turn them into a temperature.
 */
export type Sampling =
  | 'most-predictable'
  | 'predictable'
  | 'slightly-predictable'
  | 'balanced'
  | 'slightly-creative'
  | 'creative'
  | 'most-creative';

/** The temperature WebLLM and transformers.js use for each sampling level. */
export const SAMPLING_TEMPERATURE: Readonly<Record<Sampling, number>> = {
  'most-predictable': 0,
  predictable: 0.2,
  'slightly-predictable': 0.4,
  balanced: 0.7,
  'slightly-creative': 0.9,
  creative: 1.1,
  'most-creative': 1.3,
};

/**
 * Settings that mean the same for every engine. Each engine takes the ones it supports, so a
 * setting it cannot honour does not compile, and maps them to its library.
 */
export interface ModelSettings {
  /**
   * How many tokens fit into the context: system prompt, conversation, tool results and the
   * reply. The agent compacts the conversation to fit it.
   */
  readonly contextWindowSize?: number;
  /** Longest reply in tokens. */
  readonly maxOutputTokens?: number;
  readonly sampling?: Sampling;
}

/** Tokens of one model call, as the engine counted them. */
export interface Usage {
  /** Prompt and reply together: what the context holds after the call. */
  readonly totalTokens: number;
  readonly promptTokens?: number;
  readonly outputTokens?: number;
}

/** `stop`: the model ended the reply. `length`: the reply reached `maxOutputTokens`. */
export type FinishReason = 'stop' | 'length';

/** A piece of a streamed reply. */
export type EnginePart =
  | { readonly type: 'text'; readonly text: string }
  /** The last part: why the reply ended and, when the engine knows, the tokens it used. */
  | {
      readonly type: 'finish';
      readonly reason: FinishReason;
      readonly usage?: Usage;
    };

/**
 * A model running in the browser. Engines only turn chat messages into text:
 * tool calling, repair and the AG-UI protocol are handled by the agent.
 */
export interface Engine {
  /** Stable id, for example "prompt-api" or "web-llm:Qwen3-1.7B-q4f16_1-MLC". */
  readonly id: string;
  /** Which engine of this library it is. Not set for an engine of your own. */
  readonly kind?: EngineKind;
  /** True when `generate` can force JSON output with `constraint`. */
  readonly supportsConstraint: boolean;
  /**
   * How many tokens the model's context holds, prompt and reply together. The agent's
   * compaction reads it after `load()` and cuts the conversation before it gets that long.
   * Leave it out, or undefined, when the engine does not know: the compaction then leaves the
   * conversation as it is.
   */
  readonly contextWindowSize?: number | undefined;
  /** Whether the model can run here, needs a download, or is not supported. Downloads nothing. */
  availability(): Promise<Availability>;
  /** Downloads and loads the model. Browsers may require a user gesture for this. */
  load(options?: LoadOptions): Promise<void>;
  /**
   * Streams the reply: `text` parts while the model writes, then one `finish` part. A reply
   * without a `finish` part counts as stopped by the model. Throws when `signal` aborts.
   */
  generate(request: GenerateRequest): AsyncIterable<EnginePart>;
  /**
   * Frees the model (memory, GPU buffers, worker) and stops a load in progress; callers
   * waiting for that load are rejected. Downloaded files stay, so the next `load()` is fast.
   */
  unload(): Promise<void>;
  /**
   * Unloads the model and removes its files from browser storage, using the library's own
   * API. Optional because the Prompt API model belongs to the browser: a page cannot delete it.
   */
  delete?(): Promise<void>;
}
