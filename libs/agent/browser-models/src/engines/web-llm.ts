import type {
  Availability,
  Engine,
  GenerateRequest,
  LoadOptions,
} from '../lib/engine.ts';
import type { AppConfig, MLCEngineInterface } from '@mlc-ai/web-llm';
import { SharedLoad } from './shared-load.ts';

type WebLlmLibrary = typeof import('@mlc-ai/web-llm');

export interface WebLlmOptions {
  /**
   * Creates the Web Worker the model runs in, so the page stays responsive. Called once per
   * load; `unload()` and `delete()` terminate the worker. The worker file calls
   * `startWebLlmWorker()` from `@soverius-ai/browser-models/web-llm/worker`.
   */
  readonly worker?: () => Worker;
  /** WebLLM app config, for example `{ ...prebuiltAppConfig, cacheBackend: 'opfs' }`. */
  readonly appConfig?: AppConfig;
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
  readonly supportsConstraint = true;
  readonly #modelId: string;
  readonly #options: WebLlmOptions;
  readonly #model: SharedLoad<Loaded>;
  #library: Promise<WebLlmLibrary> | undefined;

  constructor(modelId: string, options: WebLlmOptions = {}) {
    this.id = `web-llm:${modelId}`;
    this.#modelId = modelId;
    this.#options = options;
    this.#model = new SharedLoad(
      (onProgress, signal) => this.#start(onProgress, signal),
      free,
    );
  }

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
  }: GenerateRequest): AsyncGenerator<string> {
    const { mlc } = await this.#model.get(signal ? { signal } : {});
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
        ...(constraint
          ? {
              response_format: {
                type: 'json_object',
                schema: JSON.stringify(constraint),
              },
            }
          : {}),
      });
      for await (const chunk of chunks) {
        const text = chunk.choices[0]?.delta.content;
        if (text) yield text;
      }
      finished = true;
      // WebLLM ends the stream quietly when interrupted; report the abort to the caller.
      signal?.throwIfAborted();
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
    const config = {
      ...(this.#options.appConfig
        ? { appConfig: this.#options.appConfig }
        : {}),
      initProgressCallback: (report: { progress: number }) =>
        onProgress(report.progress),
    };
    const worker = this.#options.worker?.();
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
      await loaded.mlc.reload(this.#modelId);
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

  /** WebLLM is large: it is imported on first use, once per engine. */
  #webLlm(): Promise<WebLlmLibrary> {
    this.#library ??= import('@mlc-ai/web-llm').catch((error: unknown) => {
      this.#library = undefined; // allow a retry, for example after being offline
      throw error;
    });
    return this.#library;
  }
}

async function free({ mlc, worker }: Loaded): Promise<void> {
  await mlc.unload();
  worker?.terminate();
}
