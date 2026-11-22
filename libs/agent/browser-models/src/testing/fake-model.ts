/**
 * One controllable model, shared by the library mocks of the engine specs. A mock calls
 * `load()`, `free()`, `delete()`, `reply()` and `stop()` where the real library would do the
 * work; the contract tests drive and inspect it.
 */
export class FakeModel {
  /** Whether the model files are in browser storage. */
  downloaded = false;
  /** Model instances in memory: loaded and not yet freed. */
  live = 0;
  /** Whether the library was told to stop generating. */
  stopped = false;
  #loads: {
    readonly onProgress: (fraction: number) => void;
    readonly resolve: () => void;
    readonly reject: (error: Error) => void;
  }[] = [];

  /** Loads that were started and have not finished. */
  get pending(): number {
    return this.#loads.length;
  }

  reset(): void {
    this.downloaded = false;
    this.live = 0;
    this.stopped = false;
    this.#loads = [];
  }

  /**
   * Loads the model into memory. Downloading it first stays pending until `finishLoad()` or
   * `failLoad()`.
   */
  async load(
    onProgress: (fraction: number) => void = () => undefined,
  ): Promise<void> {
    if (this.downloaded) {
      this.live++;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.#loads.push({ onProgress, resolve, reject });
    });
  }

  progress(fraction: number): void {
    for (const load of this.#loads) load.onProgress(fraction);
  }

  finishLoad(): void {
    this.downloaded = true;
    this.live += this.#loads.length;
    for (const load of this.#loads.splice(0)) load.resolve();
  }

  failLoad(error: Error): void {
    for (const load of this.#loads.splice(0)) load.reject(error);
  }

  free(): void {
    this.live--;
  }

  delete(): void {
    this.downloaded = false;
  }

  stop(): void {
    this.stopped = true;
  }

  /** The reply "Hello" in two pieces. Like the real libraries, it ends quietly when stopped. */
  async *reply(): AsyncGenerator<string> {
    this.stopped = false;
    yield 'Hel';
    await new Promise((resolve) => setTimeout(resolve));
    if (!this.stopped) yield 'lo';
  }
}
