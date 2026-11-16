import { describeEngineContract, FakeModel } from './engine-contract.ts';
import { WebLlmEngine } from './web-llm.ts';

const model = new FakeModel();
const requests: { response_format?: unknown }[] = [];
const reloads: unknown[][] = [];
const terminated = vi.fn();

vi.mock('@mlc-ai/web-llm', () => {
  /** Stands in for both MLCEngine and WebWorkerMLCEngine. */
  class MLCEngine {
    readonly #progress: (report: { progress: number }) => void;
    #loaded = false;
    #unloaded = false;

    /** `(config)` for MLCEngine, `(worker, config)` for WebWorkerMLCEngine. */
    constructor(...args: unknown[]) {
      const config = args.at(-1) as {
        initProgressCallback: (report: { progress: number }) => void;
      };
      this.#progress = config.initProgressCallback;
    }

    async reload(...args: unknown[]): Promise<void> {
      reloads.push(args);
      this.#unloaded = false;
      await model.load((progress) => this.#progress({ progress }));
      // Like WebLLM: a reload stopped by unload() returns quietly, without a model.
      if (this.#unloaded) return model.free();
      this.#loaded = true;
    }

    async unload(): Promise<void> {
      this.#unloaded = true;
      if (this.#loaded) model.free();
      this.#loaded = false;
    }

    async interruptGenerate(): Promise<void> {
      model.stop();
    }

    readonly chat = {
      completions: {
        create: async (request: { response_format?: unknown }) => {
          requests.push(request);
          return (async function* () {
            for await (const content of model.reply())
              yield { choices: [{ delta: { content } }] };
          })();
        },
      },
    };
  }
  return {
    MLCEngine,
    WebWorkerMLCEngine: MLCEngine,
    prebuiltAppConfig: {
      model_list: [
        { model_id: 'Small-MLC', overrides: { context_window_size: 4096 } },
      ],
    },
    hasModelInCache: async () => model.downloaded,
    deleteModelAllInfoInCache: async () => model.delete(),
  };
});

const messages = [{ role: 'user' as const, content: 'Hi' }];

beforeEach(() => {
  Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
});

describeEngineContract(model, () => new WebLlmEngine('Qwen3-0.6B-q4f16_1-MLC'));

describe('WebLlmEngine', () => {
  beforeEach(() => {
    model.reset();
    model.downloaded = true;
    requests.length = 0;
    reloads.length = 0;
    terminated.mockClear();
  });

  it('is unavailable without WebGPU', async () => {
    Reflect.deleteProperty(navigator, 'gpu');
    expect(await new WebLlmEngine('Any-MLC').availability()).toBe(
      'unavailable',
    );
  });

  it('forces JSON output with a constraint', async () => {
    const reply = new WebLlmEngine('Any-MLC').generate({
      messages,
      constraint: { type: 'object' },
    });
    for await (const chunk of reply) void chunk;

    expect(requests[0]?.response_format).toEqual({
      type: 'json_object',
      schema: '{"type":"object"}',
    });
  });

  it("loads with the model's own settings by default", async () => {
    await new WebLlmEngine('Any-MLC').load();

    expect(reloads).toEqual([['Any-MLC', undefined]]);
  });

  it('passes the context size and the chat options to WebLLM', async () => {
    await new WebLlmEngine('Any-MLC', {
      contextWindowSize: 16384,
      chatOptions: { temperature: 0.2, context_window_size: 2048 },
    }).load();

    expect(reloads).toEqual([
      ['Any-MLC', { temperature: 0.2, context_window_size: 16384 }],
    ]);
  });

  it('reports the context size the model was built with, once it is loaded', async () => {
    const engine = new WebLlmEngine('Small-MLC');
    expect(engine.contextWindowSize).toBeUndefined();

    await engine.load();

    expect(engine.contextWindowSize).toBe(4096);
  });

  it('reports the context size it was given', () => {
    expect(
      new WebLlmEngine('Small-MLC', { contextWindowSize: 16384 })
        .contextWindowSize,
    ).toBe(16384);
    expect(
      new WebLlmEngine('Small-MLC', {
        chatOptions: { context_window_size: 8192 },
      }).contextWindowSize,
    ).toBe(8192);
  });

  it('creates one worker per load and terminates it on unload', async () => {
    const worker = vi.fn(
      () => ({ terminate: terminated }) as unknown as Worker,
    );
    const engine = new WebLlmEngine('Any-MLC', { worker });

    await engine.load();
    await engine.load();
    expect(worker).toHaveBeenCalledTimes(1);
    expect(terminated).not.toHaveBeenCalled();

    await engine.unload();
    expect(terminated).toHaveBeenCalledTimes(1);
    expect(model.live).toBe(0);
  });

  it('terminates the worker of a failed load', async () => {
    model.downloaded = false;
    const worker = () => ({ terminate: terminated }) as unknown as Worker;
    const failed = new WebLlmEngine('Any-MLC', { worker }).load();
    await vi.waitFor(() => expect(model.pending).toBe(1));
    model.failLoad(new Error('offline'));

    await expect(failed).rejects.toThrow('offline');
    expect(terminated).toHaveBeenCalledTimes(1);
  });
});
