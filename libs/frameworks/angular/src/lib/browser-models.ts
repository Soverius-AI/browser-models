import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { ModelStore, type ModelState } from '@soverius-ai/browser-models';
import type { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { BROWSER_MODELS_AGENT } from './tokens.ts';

export type { ModelStatus, StorageUse } from '@soverius-ai/browser-models';

/**
 * Model state as Angular signals, on top of the framework-neutral `ModelStore`.
 * Provided by `provideBrowserModels()`; use `injectBrowserModels()`.
 */
@Injectable()
export class BrowserModels {
  // Public members have explicit types: an inferred type can end up in the published .d.ts as a
  // path into this repository.
  readonly agent: BrowserModelsAgent = inject(BROWSER_MODELS_AGENT);

  readonly #store = new ModelStore(this.agent);
  readonly #state = signal(this.#store.getState());

  /** The ids of all registered models, for a model picker. */
  readonly modelIds: readonly string[] = this.#store.modelIds;
  /** The model the chat uses. Change it with `selectModel()`. */
  readonly selectedModel: Signal<ModelState['selectedModel']> = computed(
    () => this.#state().selectedModel,
  );
  /** Whether the selected model can run, needs a download, or is not supported here. */
  readonly availability: Signal<ModelState['availability']> = computed(
    () => this.#state().availability,
  );
  /** Download progress from 0 to 1 while `download()` runs. */
  readonly progress: Signal<ModelState['progress']> = computed(
    () => this.#state().progress,
  );
  /** The last error, if any. */
  readonly error: Signal<ModelState['error']> = computed(
    () => this.#state().error,
  );
  /** All registered models and whether they are downloaded. Filled by `refreshModels()`. */
  readonly models: Signal<ModelState['models']> = computed(
    () => this.#state().models,
  );
  /** Browser storage used by this site. Filled by `refreshModels()`. */
  readonly storage: Signal<ModelState['storage']> = computed(
    () => this.#state().storage,
  );
  /** True when the selected model is ready for chat. */
  readonly ready: Signal<boolean> = computed(
    () => this.#state().availability === 'available',
  );

  constructor() {
    const stop = this.#store.subscribe(() =>
      this.#state.set(this.#store.getState()),
    );
    inject(DestroyRef).onDestroy(stop);
  }

  /** Switches the chat to another registered model. There is no automatic fallback. */
  selectModel(modelId: string): Promise<void> {
    return this.#store.selectModel(modelId);
  }

  /** Checks the selected model's availability again. */
  refresh(): Promise<void> {
    return this.#store.refresh();
  }

  /** Checks every registered model. Call it when you show a model list. */
  refreshModels(): Promise<void> {
    return this.#store.refreshModels();
  }

  /** Downloads and loads the selected model. Call it from a click: browsers may require a user gesture. */
  download(): Promise<void> {
    return this.#store.download();
  }

  /** Deletes a downloaded model with its engine's official API. */
  deleteModel(modelId: string): Promise<void> {
    return this.#store.deleteModel(modelId);
  }
}

/** The model state of the agent registered with `provideBrowserModels()`. */
export function injectBrowserModels(): BrowserModels {
  return inject(BrowserModels);
}
