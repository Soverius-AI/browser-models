import { describeEngineContract, FakeModel } from './engine-contract.ts';
import { TransformersJsEngine } from './transformers.ts';

const model = new FakeModel();
const loaded: { modelId: string; device: string; dtype: string }[] = [];
const cleared: string[] = [];
const prompts: unknown[] = [];
const runs: Record<string, unknown>[] = [];

vi.mock('@huggingface/transformers', () => {
  class TextStreamer {
    constructor(
      readonly tokenizer: unknown,
      readonly options: { callback_function: (text: string) => void },
    ) {}
  }
  class InterruptableStoppingCriteria {
    interrupt() {
      model.stop();
    }
  }
  interface LoadOptions {
    device: string;
    dtype: string;
    progress_callback: (info: unknown) => void;
  }
  async function load(modelId: string, options: LoadOptions): Promise<void> {
    loaded.push({ modelId, device: options.device, dtype: options.dtype });
    await model.load((fraction) =>
      options.progress_callback({
        status: 'progress_total',
        progress: fraction * 100,
      }),
    );
  }
  async function generate(settings: { streamer: TextStreamer }) {
    const { streamer, ...rest } = settings;
    runs.push(rest);
    for await (const text of model.reply())
      streamer.options.callback_function(text);
  }
  return {
    TextStreamer,
    InterruptableStoppingCriteria,
    env: {},
    ModelRegistry: {
      is_pipeline_cached: async () => model.downloaded,
      clear_pipeline_cache: async (task: string, modelId: string) => {
        cleared.push(`${task}:${modelId}`);
        model.delete();
      },
      is_cached: async () => model.downloaded,
      clear_cache: async (modelId: string) => {
        cleared.push(`model:${modelId}`);
        model.delete();
      },
    },
    AutoProcessor: {
      from_pretrained: async () =>
        Object.assign(
          (prompt: string) => Promise.resolve({ input_ids: prompt }),
          {
            tokenizer: {},
            apply_chat_template: (messages: unknown) => {
              prompts.push(messages);
              return 'PROMPT';
            },
          },
        ),
    },
    AutoModelForImageTextToText: {
      from_pretrained: async (modelId: string, options: LoadOptions) => {
        await load(modelId, options);
        return { generate, dispose: async () => model.free() };
      },
    },
    pipeline: async (_task: string, modelId: string, options: LoadOptions) => {
      await load(modelId, options);
      return Object.assign(
        (_messages: unknown, settings: { streamer: TextStreamer }) =>
          generate(settings),
        { tokenizer: {}, dispose: async () => model.free() },
      );
    },
  };
});

const messages = [{ role: 'user' as const, content: 'Hi' }];

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
}

beforeEach(() => {
  Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
});

describeEngineContract(
  model,
  () => new TransformersJsEngine('onnx-community/Qwen3-0.6B-ONNX'),
);

describe('multimodal models', () => {
  describeEngineContract(
    model,
    () =>
      new TransformersJsEngine('onnx-community/gemma-4-E4B-it-ONNX', {
        task: 'image-text-to-text',
      }),
  );
});

describe('TransformersJsEngine', () => {
  beforeEach(() => {
    model.reset();
    model.downloaded = true;
    loaded.length = 0;
    cleared.length = 0;
    prompts.length = 0;
    runs.length = 0;
  });

  it('is unavailable on WebGPU without a GPU, but works on WASM', async () => {
    Reflect.deleteProperty(navigator, 'gpu');
    expect(await new TransformersJsEngine('a/model').availability()).toBe(
      'unavailable',
    );
    expect(
      await new TransformersJsEngine('a/model', {
        device: 'wasm',
      }).availability(),
    ).toBe('available');
  });

  it('loads with the right device and precision', async () => {
    await new TransformersJsEngine('a/model').load();
    await new TransformersJsEngine('a/model', { device: 'wasm' }).load();

    expect(loaded).toEqual([
      { modelId: 'a/model', device: 'webgpu', dtype: 'q4f16' },
      { modelId: 'a/model', device: 'wasm', dtype: 'q4' },
    ]);
  });

  it('loads multimodal models like Gemma 4 with AutoProcessor and sends them text', async () => {
    const engine = new TransformersJsEngine('a/gemma', {
      task: 'image-text-to-text',
    });

    expect(await collect(engine.generate({ messages }))).toBe('Hello');
    expect(prompts).toEqual([messages]);
  });

  it('runs without sampling and with 1024 new tokens by default', async () => {
    await collect(new TransformersJsEngine('any/model').generate({ messages }));

    expect(runs[0]).toMatchObject({ max_new_tokens: 1024, do_sample: false });
  });

  it('passes generation settings to transformers.js', async () => {
    const engine = new TransformersJsEngine('any/model', {
      maxNewTokens: 256,
      generation: { do_sample: true, temperature: 0.7 },
    });
    await collect(engine.generate({ messages }));

    expect(runs[0]).toMatchObject({
      max_new_tokens: 256,
      do_sample: true,
      temperature: 0.7,
    });
  });

  it('deletes with the cache helpers that fit the task', async () => {
    await new TransformersJsEngine('a/model').delete();
    await new TransformersJsEngine('a/gemma', {
      task: 'image-text-to-text',
    }).delete();

    expect(cleared).toEqual(['text-generation:a/model', 'model:a/gemma']);
  });

  it('finishes a download that unload() gave up on before it deletes', async () => {
    model.downloaded = false;
    const engine = new TransformersJsEngine('a/model');
    const loading = engine.load().catch(() => undefined);
    await vi.waitFor(() => expect(model.pending).toBe(1));
    await engine.unload();
    await loading;

    const deleted = engine.delete();
    await new Promise((resolve) => setTimeout(resolve));
    expect(cleared).toEqual([]); // still waiting for transformers.js
    expect(await engine.availability()).toBe('downloading');

    model.finishLoad();
    await deleted;
    expect(cleared).toEqual(['text-generation:a/model']);
    expect(model.downloaded).toBe(false);
    expect(model.live).toBe(0);
    expect(await engine.availability()).toBe('downloadable');
  });
});
