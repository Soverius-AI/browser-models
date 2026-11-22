/** Turns callbacks into an async iterable: push values in, read them with `for await`. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  #items: T[] = [];
  #done = false;
  #error: unknown;
  #wake: (() => void) | undefined;

  /** Adds a value for the reader. */
  push(item: T): void {
    this.#items.push(item);
    this.#wake?.();
  }

  /** Ends the stream after the values pushed so far. */
  close(): void {
    this.#done = true;
    this.#wake?.();
  }

  /** Ends the stream with `error`: the reader throws it after the values pushed so far. */
  fail(error: unknown): void {
    this.#error = error ?? new Error('Failed.');
    this.close();
  }

  /** Reads the values with `for await`. Read once. */
  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (;;) {
      const item = this.#items.shift();
      if (item !== undefined) {
        yield item;
        continue;
      }
      if (this.#error) throw this.#error;
      if (this.#done) return;
      await new Promise<void>((resolve) => (this.#wake = resolve));
      this.#wake = undefined;
    }
  }
}
