import { onScopeDispose, shallowReadonly, shallowRef, type Ref } from 'vue';
import type {
  BrowserModelsAgent,
  ModelState,
  ModelStore,
} from '@soverius-ai/browser-models/agent';

/**
 * The state of a model store as a read-only Vue ref, updated on every change.
 * Call it in `setup()`; it stops listening when the component is unmounted.
 *
 * ```vue
 * const state = useModelStore(models); // models = new ModelStore(agent)
 * <button @click="models.download()">Download</button>
 * ```
 */
export function useModelStore(store: ModelStore): Readonly<Ref<ModelState>> {
  const state = shallowRef(store.getState());
  const stop = store.subscribe(() => {
    state.value = store.getState();
  });
  onScopeDispose(stop);
  return shallowReadonly(state);
}

/** Sends the agent's events to the soverius debugger while the component is mounted. */
export function useDevtools(
  agent: Pick<BrowserModelsAgent, 'connectDevtools'>,
  enabled = true,
): void {
  if (enabled) onScopeDispose(agent.connectDevtools());
}
