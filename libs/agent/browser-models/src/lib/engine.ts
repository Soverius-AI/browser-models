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

export interface LoadOptions {
  /** Download or load progress from 0 to 1. */
  readonly onProgress?: (fraction: number) => void;
  readonly signal?: AbortSignal;
}

export interface GenerateRequest {
  readonly messages: readonly ChatMessage[];
  /** Force the output to match this JSON Schema. Only used when `supportsConstraint` is true. */
  readonly constraint?: JsonSchema;
  readonly signal?: AbortSignal;
}

/**
 * A model running in the browser. Engines only turn chat messages into text:
 * tool calling, repair and the AG-UI protocol are handled by the agent.
 */
export interface Engine {
  /** Stable id, for example "prompt-api" or "web-llm:Qwen3-1.7B-q4f16_1-MLC". */
  readonly id: string;
  /** True when `generate` can force JSON output with `constraint`. */
  readonly supportsConstraint: boolean;
  /**
   * How many tokens the model's context holds, prompt and reply together. The agent's
   * compaction reads it after `load()` and cuts the conversation before it gets that long.
   * Leave it out, or undefined, when the engine does not know: `SummaryCompaction` then leaves
   * the conversation as it is.
   */
  readonly contextWindowSize?: number | undefined;
  availability(): Promise<Availability>;
  /** Downloads and loads the model. Browsers may require a user gesture for this. */
  load(options?: LoadOptions): Promise<void>;
  /** Streams the reply as text fragments. Throws when `signal` aborts. */
  generate(request: GenerateRequest): AsyncIterable<string>;
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
