import type {
  Availability,
  ChatMessage,
  Engine,
  GenerateRequest,
  LoadOptions,
} from '../lib/engine.ts';
import { AsyncQueue } from '../lib/async-queue.ts';
import { opfsCache, type FileCache } from './opfs-cache.ts';
import { SharedLoad } from './shared-load.ts';
import type {
  InterruptableStoppingCriteria,
  PreTrainedTokenizer,
  ProgressInfo,
  TextStreamer,
} from '@huggingface/transformers';

export interface TransformersJsOptions {
  /**
   * How the model is loaded.
   * - `text-generation` (default): text-only models, for example "onnx-community/Qwen3-0.6B-ONNX".
   * - `image-text-to-text`: multimodal models loaded with `AutoProcessor`, for example
   *   "onnx-community/gemma-4-E4B-it-ONNX". This engine sends them text only.
   */
  readonly task?: 'text-generation' | 'image-text-to-text';
  /** Where the model runs. `webgpu` is fast; `wasm` works without a GPU. Default `webgpu`. */
  readonly device?: 'webgpu' | 'wasm';
  /** Weight precision. Default `q4f16` on WebGPU and `q4` on WASM. */
  readonly dtype?: 'q4f16' | 'q4' | 'q8' | 'fp16' | 'fp32';
  /** Longest reply in tokens. Default 1024. */
  readonly maxNewTokens?: number;
  /**
   * Where model files are stored. `cache-api` (default) is transformers.js' own choice;
   * `opfs` stores them in the Origin Private File System. transformers.js keeps this setting
   * globally, so it applies to every transformers.js model on the page.
   */
  readonly storage?: 'cache-api' | 'opfs';
}

type Dtype = NonNullable<TransformersJsOptions['dtype']>;
type TransformersLibrary = typeof import('@huggingface/transformers');

/** What the engine needs from a loaded model, whichever way it was loaded. */
interface Runner {
  readonly tokenizer: PreTrainedTokenizer;
  run(
    messages: readonly ChatMessage[],
    settings: {
      streamer: TextStreamer;
      stopping: InterruptableStoppingCriteria;
    },
  ): Promise<unknown>;
  /** Frees the ONNX sessions and GPU buffers. */
  dispose(): Promise<unknown>;
}

/**
 * Engine for transformers.js: ONNX models from the Hugging Face Hub. Weights are stored by
 * transformers.js (Cache API). The library is loaded on first use, so it is not part of
 * your initial bundle.
 */
export class TransformersJsEngine implements Engine {
  readonly id: string;
  readonly supportsConstraint = false;
  readonly #modelId: string;
  readonly #task: 'text-generation' | 'image-text-to-text';
  readonly #device: 'webgpu' | 'wasm';
  readonly #dtype: Dtype;
  readonly #maxNewTokens: number;
  /** Only opens the OPFS folder when a file is read or written. */
  readonly #cache: FileCache | undefined;
  readonly #model: SharedLoad<Runner>;
  /** Settles when transformers.js has finished the last load, also one unload() gave up on. */
  #lastLoad: Promise<unknown> = Promise.resolve();
  #deleting = false;
  #library: Promise<TransformersLibrary> | undefined;

  constructor(modelId: string, options: TransformersJsOptions = {}) {
    this.id = `transformers:${modelId}`;
    this.#modelId = modelId;
    this.#task = options.task ?? 'text-generation';
    this.#device = options.device ?? 'webgpu';
    this.#dtype = options.dtype ?? (this.#device === 'webgpu' ? 'q4f16' : 'q4');
    this.#maxNewTokens = options.maxNewTokens ?? 1024;
    this.#cache = options.storage === 'opfs' ? opfsCache() : undefined;
    this.#model = new SharedLoad(
      (onProgress, signal) => {
        const loading = this.#start(onProgress, signal, this.#lastLoad);
        this.#lastLoad = loading.catch(() => undefined);
        return loading;
      },
      (runner) => runner.dispose(),
    );
  }

  async availability(): Promise<Availability> {
    if (this.#device === 'webgpu' && !('gpu' in navigator))
      return 'unavailable';
    if (this.#model.state === 'loading' || this.#deleting) return 'downloading';
    if (this.#model.state === 'ready') return 'available';
    const { ModelRegistry } = await this.#transformers();
    // `image-text-to-text` is not a transformers.js pipeline task, so multimodal models use the
    // model-level helpers, which cover model, tokenizer and processor files.
    const cached =
      this.#task === 'text-generation'
        ? await ModelRegistry.is_pipeline_cached(
            this.#task,
            this.#modelId,
            this.#files(),
          )
        : await ModelRegistry.is_cached(this.#modelId, this.#files());
    return cached ? 'available' : 'downloadable';
  }

  async load(options?: LoadOptions): Promise<void> {
    await this.#model.get(options);
  }

  async unload(): Promise<void> {
    await this.#model.reset();
  }

  async delete(): Promise<void> {
    this.#deleting = true;
    try {
      // transformers.js cannot stop a download. Let it finish first, so that no file is
      // written after the cache is cleared.
      await this.#lastLoad;
      await this.unload();
      await this.#clearCache();
    } finally {
      this.#deleting = false;
    }
  }

  async #clearCache(): Promise<void> {
    const { ModelRegistry } = await this.#transformers();
    if (this.#task === 'text-generation') {
      await ModelRegistry.clear_pipeline_cache(
        this.#task,
        this.#modelId,
        this.#files(),
      );
    } else {
      await ModelRegistry.clear_cache(this.#modelId, this.#files());
    }
  }

  async *generate({
    messages,
    signal,
  }: GenerateRequest): AsyncGenerator<string> {
    const runner = await this.#model.get(signal ? { signal } : {});
    const { TextStreamer, InterruptableStoppingCriteria } =
      await this.#transformers();
    const stopping = new InterruptableStoppingCriteria();
    const stop = () => stopping.interrupt();
    signal?.addEventListener('abort', stop);

    // transformers.js calls back with text pieces; hand them to the async generator.
    const queue = new AsyncQueue<string>();
    const streamer = new TextStreamer(runner.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text) => {
        if (text) queue.push(text);
      },
    });
    runner.run(messages, { streamer, stopping }).then(
      () => queue.close(),
      (error: unknown) => queue.fail(error),
    );

    let finished = false;
    try {
      yield* queue;
      finished = true;
      // transformers.js ends quietly when interrupted; report the abort to the caller.
      signal?.throwIfAborted();
    } finally {
      signal?.removeEventListener('abort', stop);
      // The caller stopped reading early: stop generating.
      if (!finished) stop();
    }
  }

  /** The files this engine uses of the model repository. */
  #files(): { device: 'webgpu' | 'wasm'; dtype: Dtype } {
    return { device: this.#device, dtype: this.#dtype };
  }

  async #start(
    onProgress: (fraction: number) => void,
    signal: AbortSignal,
    previousLoad: Promise<unknown>,
  ): Promise<Runner> {
    // One load at a time: a load that unload() gave up on is still running in transformers.js.
    await previousLoad;
    const progress_callback = (info: ProgressInfo) => {
      if (info.status === 'progress_total') onProgress(info.progress / 100);
    };
    const runner = await (this.#task === 'text-generation'
      ? this.#loadPipeline(progress_callback)
      : this.#loadMultimodal(progress_callback));
    // transformers.js cannot stop a load: a model that arrives after unload() is freed here.
    if (signal.aborted) {
      await runner.dispose();
      signal.throwIfAborted();
    }
    return runner;
  }

  async #loadPipeline(
    progress_callback: (info: ProgressInfo) => void,
  ): Promise<Runner> {
    const { pipeline } = await this.#transformers();
    const pipe = await pipeline('text-generation', this.#modelId, {
      ...this.#files(),
      progress_callback,
    });
    return {
      tokenizer: pipe.tokenizer,
      run: (messages, { streamer, stopping }) =>
        pipe([...messages], {
          max_new_tokens: this.#maxNewTokens,
          do_sample: false,
          streamer,
          stopping_criteria: stopping,
        }),
      dispose: () => pipe.dispose(),
    };
  }

  /** The way the Gemma 4 model card loads the model: AutoProcessor plus the model class. */
  async #loadMultimodal(
    progress_callback: (info: ProgressInfo) => void,
  ): Promise<Runner> {
    const { AutoProcessor, AutoModelForImageTextToText } =
      await this.#transformers();
    const [processor, model] = await Promise.all([
      AutoProcessor.from_pretrained(this.#modelId),
      AutoModelForImageTextToText.from_pretrained(this.#modelId, {
        ...this.#files(),
        progress_callback,
      }),
    ]);
    const tokenizer = processor.tokenizer;
    if (!tokenizer) {
      await model.dispose();
      throw new Error(`${this.#modelId} has no tokenizer.`);
    }
    return {
      tokenizer,
      run: async (messages, { streamer, stopping }) => {
        // `enable_thinking` is a chat-template variable from the Gemma 4 model card. The
        // typings do not list template variables, so it goes through a separate object.
        const templateOptions = {
          add_generation_prompt: true,
          enable_thinking: false,
        };
        const prompt = processor.apply_chat_template(
          [...messages],
          templateOptions,
        );
        const inputs = await processor(prompt, null, null, {
          add_special_tokens: false,
        });
        return model.generate({
          ...inputs,
          max_new_tokens: this.#maxNewTokens,
          do_sample: false,
          streamer,
          stopping_criteria: stopping,
        });
      },
      dispose: () => model.dispose(),
    };
  }

  /**
   * transformers.js is large: it is imported on first use, once per engine, and pointed at
   * the chosen storage.
   */
  #transformers(): Promise<TransformersLibrary> {
    this.#library ??= import('@huggingface/transformers').then(
      (library) => {
        if (this.#cache) {
          library.env.useCustomCache = true;
          library.env.customCache = this.#cache;
        }
        return library;
      },
      (error: unknown) => {
        this.#library = undefined; // allow a retry, for example after being offline
        throw error;
      },
    );
    return this.#library;
  }
}
