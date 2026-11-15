import { untilAborted } from '../lib/abort.ts';
import type { LoadOptions } from '../lib/engine.ts';

type Progress = (fraction: number) => void;

interface Current<T> {
  readonly loaded: Promise<T>;
  readonly cancel: AbortController;
  ready: boolean;
}

/**
 * One model load shared by every caller of an engine. Each caller gets progress and can stop
 * waiting with its own signal; the load itself only stops on `reset()`.
 */
export class SharedLoad<T> {
  readonly #start: (onProgress: Progress, signal: AbortSignal) => Promise<T>;
  readonly #free: (loaded: T) => Promise<unknown>;
  readonly #listeners = new Set<Progress>();
  #current: Current<T> | undefined;

  /**
   * `start` loads the model. When its signal aborts, it has to free what it created.
   * `free` releases a loaded model.
   */
  constructor(
    start: (onProgress: Progress, signal: AbortSignal) => Promise<T>,
    free: (loaded: T) => Promise<unknown>,
  ) {
    this.#start = start;
    this.#free = free;
  }

  get state(): 'idle' | 'loading' | 'ready' {
    if (!this.#current) return 'idle';
    return this.#current.ready ? 'ready' : 'loading';
  }

  /** Starts the load unless it is running or done, and waits for the model. */
  async get({ onProgress, signal }: LoadOptions = {}): Promise<T> {
    signal?.throwIfAborted();
    const current = (this.#current ??= this.#begin());
    const { signal: cancelled } = current.cancel;
    if (onProgress) this.#listeners.add(onProgress);
    try {
      return await untilAborted(
        current.loaded,
        signal ? AbortSignal.any([signal, cancelled]) : cancelled,
      );
    } finally {
      if (onProgress) this.#listeners.delete(onProgress);
    }
  }

  /** Stops a load in progress, or frees the loaded model. The next `get()` loads again. */
  async reset(): Promise<void> {
    const current = this.#current;
    this.#current = undefined;
    if (!current) return;
    if (current.ready) await this.#free(await current.loaded);
    else
      current.cancel.abort(
        new DOMException('The model was unloaded.', 'AbortError'),
      );
  }

  #begin(): Current<T> {
    const cancel = new AbortController();
    const current: Current<T> = {
      cancel,
      ready: false,
      loaded: this.#start(
        (fraction) => this.#listeners.forEach((listener) => listener(fraction)),
        cancel.signal,
      ),
    };
    current.loaded.then(
      () => {
        current.ready = true;
      },
      () => {
        // A failed load is forgotten, so the next get() tries again.
        if (this.#current === current) this.#current = undefined;
      },
    );
    return current;
  }
}
