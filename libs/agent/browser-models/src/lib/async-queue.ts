/** Turns callbacks into an async iterable: push values in, read them with `for await`. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  #items: T[] = [];
  #done = false;
  #error: unknown;
  #wake: (() => void) | undefined;

  push(item: T): void {
    this.#items.push(item);
    this.#wake?.();
  }

  close(): void {
    this.#done = true;
    this.#wake?.();
  }

  fail(error: unknown): void {
    this.#error = error ?? new Error('Failed.');
    this.close();
  }

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
