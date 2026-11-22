import { TestBed } from '@angular/core/testing';
import type { Availability, Engine } from '@soverius-ai/browser-models';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { injectBrowserModels } from './browser-models.ts';
import {
  provideBrowserModels,
  withAgent,
  withDevtools,
} from './provide-browser-models.ts';

function engine(availability: Availability): Engine {
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
  };
}

function setup(availability: Availability) {
  const agent = new BrowserModelsAgent({
    models: { test: engine(availability) },
    defaultModel: 'test',
  });
  TestBed.configureTestingModule({
    providers: [provideBrowserModels(withAgent(agent), withDevtools())],
  });
  return {
    agent,
    browserModels: TestBed.runInInjectionContext(() => injectBrowserModels()),
  };
}

describe('provideBrowserModels', () => {
  it('needs an agent', () => {
    expect(() => provideBrowserModels(withDevtools())).toThrow(
      'provideBrowserModels() needs withAgent(agent).',
    );
  });

  it('exposes the agent and its availability as signals', async () => {
    const { agent, browserModels } = setup('available');
    expect(browserModels.agent).toBe(agent);
    await browserModels.refresh();
    expect(browserModels.availability()).toBe('available');
    expect(browserModels.ready()).toBe(true);
  });

  it('downloads the model on request', async () => {
    const { browserModels } = setup('downloadable');
    await browserModels.refresh();
    expect(browserModels.ready()).toBe(false);

    await browserModels.download();

    expect(browserModels.availability()).toBe('available');
    expect(browserModels.progress()).toBeUndefined();
  });

  it('switches the selected model and re-checks availability', async () => {
    const agent = new BrowserModelsAgent({
      models: { ready: engine('available'), missing: engine('unavailable') },
      defaultModel: 'ready',
    });
    TestBed.configureTestingModule({
      providers: [provideBrowserModels(withAgent(agent))],
    });
    const browserModels = TestBed.runInInjectionContext(() =>
      injectBrowserModels(),
    );

    expect(browserModels.modelIds).toEqual(['ready', 'missing']);
    await browserModels.selectModel('missing');

    expect(browserModels.selectedModel()).toBe('missing');
    expect(agent.selectedModel).toBe('missing');
    expect(browserModels.availability()).toBe('unavailable');
  });

  it('lists every model with its status and deletes downloads', async () => {
    const deleted: string[] = [];
    const deletable: Engine = {
      ...engine('available'),
      id: 'web-llm:qwen',
      delete: async () => void deleted.push('qwen'),
    };
    const agent = new BrowserModelsAgent({
      models: { qwen: deletable, nano: engine('unavailable') },
      defaultModel: 'qwen',
    });
    TestBed.configureTestingModule({
      providers: [provideBrowserModels(withAgent(agent))],
    });
    const browserModels = TestBed.runInInjectionContext(() =>
      injectBrowserModels(),
    );

    await browserModels.refreshModels();
    expect(browserModels.models()).toEqual([
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

    await browserModels.deleteModel('qwen');
    expect(deleted).toEqual(['qwen']);
  });

  it('treats a failing availability check as unavailable and shows the error', async () => {
    const broken: Engine = {
      ...engine('available'),
      availability: async () => {
        throw new Error('WebLLM could not be loaded');
      },
    };
    const agent = new BrowserModelsAgent({
      models: { broken },
      defaultModel: 'broken',
    });
    TestBed.configureTestingModule({
      providers: [provideBrowserModels(withAgent(agent))],
    });
    const browserModels = TestBed.runInInjectionContext(() =>
      injectBrowserModels(),
    );

    await browserModels.refresh();
    expect(browserModels.availability()).toBe('unavailable');
    expect(browserModels.error()).toBe('WebLLM could not be loaded');

    await browserModels.refreshModels();
    expect(browserModels.models()[0]?.availability).toBe('unavailable');
  });
});
