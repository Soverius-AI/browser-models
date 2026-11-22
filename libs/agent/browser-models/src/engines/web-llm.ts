import {
  EngineKind,
  SAMPLING_TEMPERATURE,
  type Availability,
  type Engine,
  type EnginePart,
  type FinishReason,
  type GenerateRequest,
  type LoadOptions,
  type ModelSettings,
  type Sampling,
  type Usage,
} from '../lib/engine.ts';
import type {
  AppConfig,
  ChatOptions,
  MLCEngineInterface,
} from '@mlc-ai/web-llm';
import { SharedLoad } from './shared-load.ts';

type WebLlmLibrary = typeof import('@mlc-ai/web-llm');

export interface WebLlmOptions extends ModelSettings {
  /**
   * Where the model runs. Default: a Web Worker of this package, so the page stays responsive.
   * `false` runs it on the main thread. A function creates your own worker, whose file calls
   * `startWebLlmWorker()` from `@soverius-ai/browser-models/web-llm/worker`. The worker is
   * created once per load; `unload()` and `delete()` terminate it.
   */
  readonly worker?: false | (() => Worker);
  /** WebLLM app config, for example `{ ...prebuiltAppConfig, cacheBackend: 'opfs' }`. */
  readonly appConfig?: AppConfig;
  /**
   * Default: what the model was built with: 4096 for most prebuilt WebLLM models, 2048 or 1024
   * for small ones. A call that needs more fails with WebLLM's
   * `ContextWindowSizeExceededError`. A larger window needs more GPU memory.
   */
  readonly contextWindowSize?: number;
  /** Default: until the model stops or the context is full. */
  readonly maxOutputTokens?: number;
  /** Sets `temperature`. Default: the model's own setting. */
  readonly sampling?: Sampling;
  /**
   * Any other WebLLM chat option, passed to `reload()` as it is: `top_p`, `repetition_penalty`,
   * `sliding_window_size` and so on. The settings above win over the same option in here.
   */
  readonly native?: ChatOptions;
}

/** A WebLLM engine and the worker it runs in, if any. */
interface Loaded {
  readonly mlc: MLCEngineInterface;
  readonly worker: Worker | undefined;
}

/**
 * Engine for WebLLM: models compiled for WebGPU, for example "Qwen3-0.6B-q4f16_1-MLC".
 * Weights are stored by WebLLM itself (Cache API by default). The WebLLM library is
 * loaded on first use, so it is not part of your initial bundle.
 */
export class WebLlmEngine implements Engine {
  readonly id: string;
  readonly kind = EngineKind.WebLlm;
  readonly supportsConstraint = true;
  readonly #modelId: string;
  readonly #options: WebLlmOptions;
  readonly #model: SharedLoad<Loaded>;
  #library: Promise<WebLlmLibrary> | undefined;
  /** The context size the model was built with, known once WebLLM is imported. */
  #builtContextWindowSize: number | undefined;

  constructor(modelId: string, options: WebLlmOptions = {}) {
    this.id = `web-llm:${modelId}`;
    this.#modelId = modelId;
    this.#options = options;
    this.#model = new SharedLoad(
      (onProgress, signal) => this.#start(onProgress, signal),
      free,
    );
  }

  /** The `contextWindowSize` option, or what the model was built with (known after `load()`). */
  get contextWindowSize(): number | undefined {
    return (
      this.#options.contextWindowSize ??
      this.#options.native?.context_window_size ??
      this.#builtContextWindowSize
    );
  }

  /** `unavailable` without WebGPU; `available` once WebLLM has the model in its cache. */
  async availability(): Promise<Availability> {
    if (!('gpu' in navigator)) return 'unavailable';
    if (this.#model.state === 'loading') return 'downloading';
    if (this.#model.state === 'ready') return 'available';
    const { hasModelInCache } = await this.#webLlm();
    return (await hasModelInCache(this.#modelId, this.#options.appConfig))
      ? 'available'
      : 'downloadable';
  }

  async load(options?: LoadOptions): Promise<void> {
    await this.#model.get(options);
  }

  async unload(): Promise<void> {
    await this.#model.reset();
  }

  async delete(): Promise<void> {
    await this.unload();
    const { deleteModelAllInfoInCache } = await this.#webLlm();
    await deleteModelAllInfoInCache(this.#modelId, this.#options.appConfig);
  }

  async *generate({
    messages,
    constraint,
    signal,
  }: GenerateRequest): AsyncGenerator<EnginePart> {
    const { mlc } = await this.#model.get(signal ? { signal } : {});
    const { maxOutputTokens } = this.#options;
    const stop = () => void mlc.interruptGenerate();
    signal?.addEventListener('abort', stop);
    let finished = false;
    try {
      const chunks = await mlc.chat.completions.create({
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        stream: true,
        stream_options: { include_usage: true },
        ...(maxOutputTokens === undefined
          ? {}
          : { max_tokens: maxOutputTokens }),
        ...(constraint
          ? {
              response_format: {
                type: 'json_object',
                schema: JSON.stringify(constraint),
              },
            }
          : {}),
      });
      let reason: FinishReason = 'stop';
      let usage: Usage | undefined;
      for await (const chunk of chunks) {
        const [choice] = chunk.choices;
        if (choice?.delta.content)
          yield { type: 'text', text: choice.delta.content };
        if (choice?.finish_reason === 'length') reason = 'length';
        // With `include_usage` the last chunk has no choices, only the counts.
        if (chunk.usage)
          usage = {
            totalTokens: chunk.usage.total_tokens,
            promptTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
      }
      finished = true;
      // WebLLM ends the stream quietly when interrupted; report the abort to the caller.
      signal?.throwIfAborted();
      yield { type: 'finish', reason, ...(usage ? { usage } : {}) };
    } finally {
      signal?.removeEventListener('abort', stop);
      // The caller stopped reading early (or the stream failed): stop generating.
      if (!finished) stop();
    }
  }

  async #start(
    onProgress: (fraction: number) => void,
    signal: AbortSignal,
  ): Promise<Loaded> {
    const webLlm = await this.#webLlm();
    signal.throwIfAborted();
    this.#builtContextWindowSize = (
      this.#options.appConfig ?? webLlm.prebuiltAppConfig
    ).model_list.find((model) => model.model_id === this.#modelId)?.overrides
      ?.context_window_size;
    const config = {
      ...(this.#options.appConfig
        ? { appConfig: this.#options.appConfig }
        : {}),
      initProgressCallback: (report: { progress: number }) =>
        onProgress(report.progress),
    };
    const { worker: createWorker = packageWorker } = this.#options;
    const worker = createWorker === false ? undefined : createWorker();
    const loaded: Loaded = {
      worker,
      mlc: worker
        ? new webLlm.WebWorkerMLCEngine(worker, config)
        : new webLlm.MLCEngine(config),
    };
    // Unloading the engine also stops its download.
    const stop = () => void free(loaded).catch(() => undefined);
    signal.addEventListener('abort', stop);
    try {
      await loaded.mlc.reload(this.#modelId, this.#chatOptions());
    } catch (error) {
      // A failed load must not leave a worker behind.
      if (!signal.aborted) await free(loaded).catch(() => undefined);
      throw error;
    } finally {
      signal.removeEventListener('abort', stop);
    }
    // WebLLM returns quietly from a stopped download.
    signal.throwIfAborted();
    return loaded;
  }

  /** What `reload()` gets: the native chat options, with the settings on top. */
  #chatOptions(): ChatOptions | undefined {
    const { native, contextWindowSize, sampling } = this.#options;
    if (contextWindowSize === undefined && sampling === undefined)
      return native;
    return {
      ...native,
      ...(contextWindowSize === undefined
        ? {}
        : { context_window_size: contextWindowSize }),
      ...(sampling === undefined
        ? {}
        : { temperature: SAMPLING_TEMPERATURE[sampling] }),
    };
  }

  /** WebLLM is large: it is imported on first use, once per engine. */
  #webLlm(): Promise<WebLlmLibrary> {
    this.#library ??= import('@mlc-ai/web-llm').catch((error: unknown) => {
      this.#library = undefined; // allow a retry, for example after being offline
      throw error;
    });
    return this.#library;
  }
}

/**
 * The worker of this package. `new Worker(new URL(…, import.meta.url))` in one expression is
 * the form Vite, webpack, esbuild (Angular) and Parcel find and bundle as a worker.
 */
function packageWorker(): Worker {
  return new Worker(new URL('./web-llm-default.worker.js', import.meta.url), {
    type: 'module',
  });
}

async function free({ mlc, worker }: Loaded): Promise<void> {
  await mlc.unload();
  worker?.terminate();
}
