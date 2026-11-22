import { effectScope } from 'vue';
import {
  ModelStore,
  type Availability,
  type Engine,
} from '@soverius-ai/browser-models';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { useModelStore } from './use-model-store.ts';

function engine(availability: Availability): Engine {
  return {
    id: 'test',
    supportsConstraint: false,
    availability: async () => availability,
    load: async () => undefined,
    unload: async () => undefined,
    async *generate() {
      yield { type: 'text' as const, text: 'hi' };
    },
  };
}

describe('useModelStore', () => {
  it('follows the store state and stops listening when the scope ends', async () => {
    const agent = new BrowserModelsAgent({
      models: { a: engine('available'), b: engine('unavailable') },
      defaultModel: 'a',
    });
    const store = new ModelStore(agent);
    const scope = effectScope();
    const state = scope.run(() => useModelStore(store));

    await store.refresh();
    expect(state?.value.availability).toBe('available');

    scope.stop();
    await store.selectModel('b');
    expect(state?.value.selectedModel).toBe('a');
  });
});
