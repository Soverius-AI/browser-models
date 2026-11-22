import { useEffect, useSyncExternalStore } from 'react';
import type { ModelState, ModelStore } from '@soverius-ai/browser-models';
import type { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';

/**
 * The state of a model store as React state. The component re-renders on every change.
 *
 * ```tsx
 * const models = new ModelStore(agent); // once, outside components
 * const { availability, progress } = useModelStore(models);
 * <button onClick={() => models.download()}>Download</button>
 * ```
 */
export function useModelStore(store: ModelStore): ModelState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** Sends the agent's events to the soverius debugger while the component is mounted. */
export function useDevtools(
  agent: Pick<BrowserModelsAgent, 'connectDevtools'>,
  enabled = true,
): void {
  useEffect(
    () => (enabled ? agent.connectDevtools() : undefined),
    [agent, enabled],
  );
}
