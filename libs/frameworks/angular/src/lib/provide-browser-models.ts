import {
  DestroyRef,
  EnvironmentProviders,
  Provider,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';
import type { Engine } from '@soverius-ai/browser-models';
import type { BrowserModelsAgent } from '@soverius-ai/browser-models/agent';
import { BrowserModels } from './browser-models.ts';
import { BROWSER_MODELS_AGENT } from './tokens.ts';

/** A feature for `provideBrowserModels()`, in the style of `provideRouter(withX())`. */
export interface BrowserModelsFeature {
  readonly kind: 'agent' | 'devtools';
  readonly providers: readonly (Provider | EnvironmentProviders)[];
}

/**
 * Registers the browser models agent for the application:
 *
 * ```ts
 * const agent = new BrowserModelsAgent({ models: { nano: new PromptApiEngine() }, defaultModel: 'nano' });
 * providers: [
 *   provideBrowserModels(withAgent(agent), withDevtools()),
 *   provideCopilotKit({ agents: { default: agent } }),
 * ]
 * ```
 */
export function provideBrowserModels(
  ...features: readonly BrowserModelsFeature[]
): EnvironmentProviders {
  const kinds = features.map((feature) => feature.kind);
  if (!kinds.includes('agent')) {
    throw new Error('provideBrowserModels() needs withAgent(agent).');
  }
  return makeEnvironmentProviders([
    BrowserModels,
    ...features.flatMap((feature) => feature.providers),
  ]);
}

/** The agent to use. Create it with `new BrowserModelsAgent()` and pass the same agent to CopilotKit. */
export function withAgent<Models extends Readonly<Record<string, Engine>>>(
  agent: BrowserModelsAgent<Models>,
): BrowserModelsFeature {
  return {
    kind: 'agent',
    providers: [{ provide: BROWSER_MODELS_AGENT, useValue: agent }],
  };
}

/** Sends every agent event to the soverius debugger while the application runs. */
export function withDevtools(): BrowserModelsFeature {
  return {
    kind: 'devtools',
    providers: [
      provideEnvironmentInitializer(() => {
        const stop = inject(BROWSER_MODELS_AGENT).connectDevtools();
        inject(DestroyRef).onDestroy(stop);
      }),
    ],
  };
}
