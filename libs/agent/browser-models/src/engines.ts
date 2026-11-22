/**
 * `@soverius-ai/browser-models/engines`: all three engines, created by `EngineKind`. Needs both engine libraries.
 *
 * @module all-engines
 */
import { EngineKind } from './lib/engine.ts';
import {
  PromptApiEngine,
  type PromptApiOptions,
} from './engines/prompt-api.ts';
import {
  TransformersJsEngine,
  type TransformersJsOptions,
} from './engines/transformers.ts';
import { WebLlmEngine, type WebLlmOptions } from './engines/web-llm.ts';

/** The engine class and the constructor arguments of every `EngineKind`. */
export interface EngineTypes {
  [EngineKind.PromptApi]: {
    engine: PromptApiEngine;
    args: [options?: PromptApiOptions];
  };
  [EngineKind.WebLlm]: {
    engine: WebLlmEngine;
    args: [modelId: string, options?: WebLlmOptions];
  };
  [EngineKind.TransformersJs]: {
    engine: TransformersJsEngine;
    args: [modelId: string, options?: TransformersJsOptions];
  };
}

/** Any engine of this library. `switch (engine.kind)` narrows it to its class. */
export type BrowserEngine = EngineTypes[EngineKind]['engine'];

type Factories = {
  readonly [Kind in EngineKind]: (
    ...args: EngineTypes[Kind]['args']
  ) => EngineTypes[Kind]['engine'];
};

const factories: Factories = {
  [EngineKind.PromptApi]: (options) => new PromptApiEngine(options),
  [EngineKind.WebLlm]: (modelId, options) => new WebLlmEngine(modelId, options),
  [EngineKind.TransformersJs]: (modelId, options) =>
    new TransformersJsEngine(modelId, options),
};

/**
 * Creates any engine of this library by its kind, for apps that install all three engine
 * libraries. Apps that use fewer import the engine classes from their own entry points, so
 * the other libraries need not be installed.
 *
 * ```ts
 * Engines.create(EngineKind.WebLlm, 'gemma-4-E2B-it-q4f16_1-MLC', { contextWindowSize: 16384 });
 * Engines.create(EngineKind.PromptApi, { sampling: 'balanced' });
 * ```
 */
export class Engines {
  /** A new engine of `kind`, with that engine's own constructor arguments. */
  static create<Kind extends EngineKind>(
    kind: Kind,
    ...args: EngineTypes[Kind]['args']
  ): EngineTypes[Kind]['engine'] {
    // TypeScript cannot follow `kind` into the table; the table's type checks each entry.
    const create = factories[kind] as (
      ...args: EngineTypes[Kind]['args']
    ) => EngineTypes[Kind]['engine'];
    return create(...args);
  }
}

export { EngineKind };
export * from './engines/prompt-api.ts';
export * from './engines/transformers.ts';
export * from './engines/web-llm.ts';
