import { opfsCache } from './opfs-cache.ts';

/** An in-memory stand-in for an OPFS directory. */
function fakeRoot() {
  const files = new Map<string, Blob>();
  const folder = {
    async getDirectoryHandle() {
      return folder;
    },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!files.has(name) && !options?.create)
        throw new DOMException('missing', 'NotFoundError');
      return {
        getFile: async () => files.get(name) ?? new Blob([]),
        createWritable: async () => {
          const chunks: Uint8Array<ArrayBuffer>[] = [];
          return new WritableStream<Uint8Array<ArrayBuffer>>({
            write: (chunk) => void chunks.push(chunk),
            close: () => void files.set(name, new Blob(chunks)),
          });
        },
      };
    },
    async removeEntry(name: string) {
      if (!files.delete(name))
        throw new DOMException('missing', 'NotFoundError');
    },
  };
  return {
    files,
    root: async () => folder as unknown as FileSystemDirectoryHandle,
  };
}

describe('opfsCache', () => {
  it('stores, finds and deletes files by URL', async () => {
    const { files, root } = fakeRoot();
    const cache = opfsCache('test', root);
    const url = 'https://huggingface.co/model/resolve/main/config.json';

    expect(await cache.match(url)).toBeUndefined();
    await cache.put(url, new Response('{"a":1}'));
    expect(files.size).toBe(1);
    expect(await (await cache.match(url))?.text()).toBe('{"a":1}');

    expect(await cache.delete(url)).toBe(true);
    expect(await cache.match(url)).toBeUndefined();
    expect(await cache.delete(url)).toBe(false);
  });
});
