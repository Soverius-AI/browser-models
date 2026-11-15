import { act, renderHook } from '@testing-library/react';
import type { Availability, Engine } from '@soverius-ai/browser-models';
import {
  BrowserModelsAgent,
  ModelStore,
} from '@soverius-ai/browser-models/agent';
import { useModelStore } from './use-model-store.ts';

function engine(availability: Availability): Engine {
  return {
    id: 'test',
    supportsConstraint: false,
    availability: async () => availability,
    load: async () => undefined,
    unload: async () => undefined,
    async *generate() {
      yield 'hi';
    },
  };
}

describe('useModelStore', () => {
  it('re-renders with the store state', async () => {
    const agent = new BrowserModelsAgent({
      models: { a: engine('available'), b: engine('unavailable') },
      defaultModel: 'a',
    });
    const store = new ModelStore(agent);
    const { result } = renderHook(() => useModelStore(store));

    await act(() => store.refresh());
    expect(result.current.availability).toBe('available');

    await act(() => store.selectModel('b'));
    expect(result.current).toMatchObject({
      selectedModel: 'b',
      availability: 'unavailable',
    });
  });
});
