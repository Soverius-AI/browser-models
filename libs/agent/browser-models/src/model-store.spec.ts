import type { Availability, Engine } from './lib/engine.ts';
import { ModelStore } from './model-store.ts';
import { Models } from './models.ts';

function engine(
  availability: Availability,
  extra: Partial<Engine> = {},
): Engine {
  return {
    id: 'test',
    supportsConstraint: false,
    availability: async () => availability,
    async load({ onProgress } = {}) {
      onProgress?.(1);
      availability = 'available';
    },
    unload: async () => undefined,
    async *generate() {
      yield { type: 'text' as const, text: 'hi' };
    },
    ...extra,
  };
}

describe('ModelStore', () => {
  it('checks the selected model and notifies subscribers', async () => {
    const agent = new Models({ a: engine('available') }, 'a');
    const store = new ModelStore(agent);
    await store.refresh(); // let the store's own first check finish
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getState().availability));

    await store.refresh();

    expect(seen).toEqual(['checking', 'available']);
  });

  it('downloads the selected model and reports progress', async () => {
    const agent = new Models({ a: engine('downloadable') }, 'a');
    const store = new ModelStore(agent);
    const progress: (number | undefined)[] = [];
    store.subscribe(() => progress.push(store.getState().progress));

    await store.download();

    expect(progress).toContain(1);
    expect(store.getState()).toMatchObject({
      availability: 'available',
      progress: undefined,
    });
  });

  it('switches models explicitly and lists them with storage', async () => {
    const deleted: string[] = [];
    const agent = new Models(
      {
        qwen: engine('available', {
          id: 'web-llm:qwen',
          delete: async () => void deleted.push('qwen'),
        }),
        nano: engine('unavailable'),
      },
      'qwen',
    );
    const store = new ModelStore(agent);

    await store.selectModel('nano');
    expect(agent.selectedModel).toBe('nano');
    expect(store.getState().availability).toBe('unavailable');

    await store.refreshModels();
    expect(store.getState().models).toEqual([
      {
        id: 'qwen',
        engineId: 'web-llm:qwen',
        availability: 'available',
        canDelete: true,
      },
      {
        id: 'nano',
        engineId: 'test',
        availability: 'unavailable',
        canDelete: false,
      },
    ]);

    await store.deleteModel('qwen');
    expect(deleted).toEqual(['qwen']);
  });

  it('treats a failing availability check as unavailable and keeps the error', async () => {
    const broken = engine('available', {
      availability: async () => {
        throw new Error('WebLLM could not be loaded');
      },
    });
    const agent = new Models({ broken }, 'broken');
    const store = new ModelStore(agent);

    await store.refresh();

    expect(store.getState()).toMatchObject({
      availability: 'unavailable',
      error: 'WebLLM could not be loaded',
    });
  });

  it('unloads the model the user switched away from', async () => {
    const unloaded: string[] = [];
    const agent = new Models(
      {
        a: engine('available', { unload: async () => void unloaded.push('a') }),
        b: engine('available', { unload: async () => void unloaded.push('b') }),
      },
      'a',
    );
    const store = new ModelStore(agent);

    await store.selectModel('a'); // no switch
    expect(unloaded).toEqual([]);
    await store.selectModel('b');
    expect(unloaded).toEqual(['a']);
  });

  it('ignores download progress of a model that is no longer selected', async () => {
    let report: (fraction: number) => void = () => undefined;
    let finish: () => void = () => undefined;
    const slow = engine('downloadable', {
      load: ({ onProgress } = {}) =>
        new Promise<void>((resolve) => {
          if (onProgress) report = onProgress;
          finish = resolve;
        }),
    });
    const agent = new Models({ slow, other: engine('available') }, 'slow');
    const store = new ModelStore(agent);

    const download = store.download();
    report(0.25);
    expect(store.getState().progress).toBe(0.25);

    await store.selectModel('other');
    report(0.5);
    finish();
    await download;
    expect(store.getState()).toMatchObject({
      selectedModel: 'other',
      availability: 'available',
      progress: undefined,
    });
  });

  it('shows no error when the user switches away from a download and back', async () => {
    // Like the real engines, unload() stops the load and rejects its callers. Here that
    // happens late, when the user has already switched back.
    let stopLoad: (reason: Error) => void = () => undefined;
    const slow = engine('downloadable', {
      load: () => new Promise<void>((_resolve, reject) => (stopLoad = reject)),
      unload: async () => {
        await new Promise((resolve) => setTimeout(resolve));
        stopLoad(new DOMException('The model was unloaded.', 'AbortError'));
      },
    });
    const agent = new Models({ slow, other: engine('available') }, 'slow');
    const store = new ModelStore(agent);

    const download = store.download();
    await Promise.all([
      store.selectModel('other'),
      store.selectModel('slow'),
      download,
    ]);

    expect(store.getState()).toMatchObject({
      selectedModel: 'slow',
      availability: 'downloadable',
      progress: undefined,
      error: undefined,
    });
  });

  it('keeps the error of a failed delete', async () => {
    const agent = new Models(
      {
        a: engine('available', {
          delete: async () => {
            throw new Error('Storage is locked');
          },
        }),
      },
      'a',
    );
    const store = new ModelStore(agent);

    await store.deleteModel('a');
    expect(store.getState().error).toBe('Storage is locked');
  });

  it('can be passed on without bind', async () => {
    const agent = new Models({ a: engine('available') }, 'a');
    const { getState, subscribe, refresh } = new ModelStore(agent);
    const listener = vi.fn();
    subscribe(listener);
    expect(getState().selectedModel).toBe('a');
    expect(listener).not.toHaveBeenCalled();
    void refresh;
  });
});
