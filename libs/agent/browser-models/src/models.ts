import type { Engine } from './lib/engine.ts';
import type { ModelSource } from './model-store.ts';

/**
 * The models an app may use, by id, and the one it uses now. Selection is always explicit:
 * there is no automatic fallback. Pass it to `ModelStore` for a model picker without an agent;
 * `BrowserModelsAgent` keeps its models in one too. Ids are checked by TypeScript.
 *
 * ```ts
 * const models = new Models({ nano: new PromptApiEngine(), gemma }, 'gemma');
 * if ((await models.engine('nano').availability()) !== 'unavailable') models.selectModel('nano');
 * ```
 */
export class Models<
  Engines extends Readonly<Record<string, Engine>> = Readonly<
    Record<string, Engine>
  >,
> implements ModelSource {
  readonly #engines: Engines;
  #selected: keyof Engines & string;

  constructor(engines: Engines, defaultModel: keyof Engines & string) {
    if (!(defaultModel in engines)) {
      throw new Error(
        `defaultModel "${defaultModel}" is not one of the registered models.`,
      );
    }
    this.#engines = engines;
    this.#selected = defaultModel;
  }

  /** The ids of the registered models. */
  get modelIds(): readonly (keyof Engines & string)[] {
    return Object.keys(this.#engines) as (keyof Engines & string)[];
  }

  /** The model in use. Starts as `defaultModel`. */
  get selectedModel(): keyof Engines & string {
    return this.#selected;
  }

  /** Switches to another registered model. */
  selectModel(modelId: keyof Engines & string): void {
    if (!this.has(modelId)) throw new Error(`Unknown model "${modelId}".`);
    this.#selected = modelId;
  }

  /** True when `modelId` is registered, for ids that come from outside, like a request. */
  has(modelId: string): modelId is keyof Engines & string {
    return Object.hasOwn(this.#engines, modelId);
  }

  /** The engine of a model (default: the selected one). */
  engine<Id extends keyof Engines & string>(
    modelId: Id = this.#selected as Id,
  ): Engines[Id] {
    if (!this.has(modelId)) throw new Error(`Unknown model "${modelId}".`);
    return this.#engines[modelId];
  }
}
