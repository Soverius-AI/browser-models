import { isAbortError } from './lib/abort.ts';
import type { Availability, Engine } from './lib/engine.ts';

/**
 * What the model store needs from an agent. Every `BrowserModelsAgent` fits, whatever its model ids,
 * so typed agents (`BrowserModelsAgent<{ nano: Engine }>`) can be passed without casts.
 */
export interface ModelSource {
  readonly modelIds: readonly string[];
  readonly selectedModel: string;
  /** Switches to another registered model. */
  selectModel(modelId: string): void;
  /** The engine of a model, by default the selected one. */
  engine(modelId?: string): Engine;
}

/** One registered model and whether it is on this device. */
export interface ModelStatus {
  readonly id: string;
  /** The engine id, for example "web-llm:Qwen3-0.6B-q4f16_1-MLC". */
  readonly engineId: string;
  /** `available` means downloaded (or, for the Prompt API, installed by the browser). */
  readonly availability: Availability;
  /** True when the app can delete the download. The Prompt API model belongs to the browser. */
  readonly canDelete: boolean;
}

/** Browser storage used by this site, in bytes. */
export interface StorageUse {
  readonly usage: number;
  readonly quota: number;
}

/** Everything a UI needs to show about the agent's models. Replaced, never changed in place. */
export interface ModelState {
  /** The model the chat uses. */
  readonly selectedModel: string;
  /** Whether the selected model can run, needs a download, or is not supported here. */
  readonly availability: Availability | 'checking';
  /** Download progress from 0 to 1 while `download()` runs. */
  readonly progress: number | undefined;
  /** The last error, if any. */
  readonly error: string | undefined;
  /** All registered models and whether they are downloaded. Filled by `refreshModels()`. */
  readonly models: readonly ModelStatus[];
  /** Browser storage used by this site. Filled by `refreshModels()`. */
  readonly storage: StorageUse | undefined;
}

/**
 * Framework-neutral model state for one agent. Angular, React and Vue wrap it:
 * `subscribe` + `getState` fit `useSyncExternalStore`, signals and refs alike.
 * The selected model is checked right away.
 */
export class ModelStore {
  readonly agent: ModelSource;
  /** The ids of all registered models, for a model picker. */
  readonly modelIds: readonly string[];
  readonly #listeners = new Set<() => void>();
  #state: ModelState;

  constructor(agent: ModelSource) {
    this.agent = agent;
    this.modelIds = agent.modelIds;
    this.#state = {
      selectedModel: agent.selectedModel,
      availability: 'checking',
      progress: undefined,
      error: undefined,
      models: [],
      storage: undefined,
    };
    void this.refresh();
  }

  // getState and subscribe are arrow functions, so they can be passed on without `bind`.
  /** The current state. A new object after every change. */
  readonly getState = (): ModelState => this.#state;

  /** Calls `listener` after every state change. Returns a function that stops it. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /**
   * Switches the chat to another registered model and unloads the previous one: models can
   * take gigabytes of GPU memory. There is no automatic fallback.
   */
  async selectModel(modelId: string): Promise<void> {
    const previous = this.#state.selectedModel;
    this.agent.selectModel(modelId);
    this.#update({
      selectedModel: modelId,
      error: undefined,
      progress: undefined,
    });
    if (previous !== modelId) {
      await this.#reportError(modelId, () =>
        this.agent.engine(previous).unload(),
      );
    }
    await this.refresh();
  }

  /** Checks the selected model's availability again. */
  async refresh(): Promise<void> {
    const modelId = this.#state.selectedModel;
    this.#update({ availability: 'checking' });
    const availability = await this.#check(this.agent.engine(modelId));
    // Ignore the answer if the user picked another model in the meantime.
    if (this.#state.selectedModel === modelId) this.#update({ availability });
  }

  /**
   * Checks every registered model. Call it when you show a model list: it loads each
   * engine's library (WebLLM, transformers.js) to ask its cache.
   */
  async refreshModels(): Promise<void> {
    const models = await Promise.all(
      this.modelIds.map(async (id): Promise<ModelStatus> => {
        const engine = this.agent.engine(id);
        return {
          id,
          engineId: engine.id,
          availability: await this.#check(engine),
          canDelete: engine.delete !== undefined,
        };
      }),
    );
    const estimate = await globalThis.navigator?.storage?.estimate?.();
    this.#update({
      models,
      storage: estimate
        ? { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
        : undefined,
    });
  }

  /** Downloads and loads the selected model. Call it from a click: browsers may require a user gesture. */
  async download(): Promise<void> {
    const modelId = this.#state.selectedModel;
    this.#update({ availability: 'downloading', error: undefined });
    await this.#reportError(modelId, () =>
      this.agent.engine(modelId).load({
        // Progress of a model the user switched away from is not shown.
        onProgress: (fraction) => {
          if (this.#state.selectedModel === modelId)
            this.#update({ progress: fraction });
        },
      }),
    );
    if (this.#state.selectedModel !== modelId) return;
    this.#update({ progress: undefined });
    await this.refresh();
    if (this.#state.models.length > 0) await this.refreshModels();
  }

  /** Deletes a downloaded model with its engine's official API. */
  async deleteModel(modelId: string): Promise<void> {
    await this.#reportError(this.#state.selectedModel, async () =>
      this.agent.engine(modelId).delete?.(),
    );
    await this.refreshModels();
    if (modelId === this.#state.selectedModel) await this.refresh();
  }

  #update(change: Partial<ModelState>): void {
    this.#state = { ...this.#state, ...change };
    for (const listener of this.#listeners) listener();
  }

  /**
   * Runs `action`; a failure lands in `error` if `modelId` is still the selected model.
   * A load that stopped because the store unloaded the model is not a failure.
   */
  async #reportError(
    modelId: string,
    action: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (!isAbortError(error) && this.#state.selectedModel === modelId)
        this.#update({ error: messageOf(error) });
    }
  }

  async #check(engine: Engine): Promise<Availability> {
    try {
      return await engine.availability();
    } catch (error) {
      // A failing check (for example an engine library that could not be loaded)
      // counts as unavailable instead of leaving the UI waiting forever.
      this.#update({ error: messageOf(error) });
      return 'unavailable';
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
