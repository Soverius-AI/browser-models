/**
 * A transformers.js cache (`env.customCache`) that stores model files in the Origin Private
 * File System instead of the Cache API. Files are named by the SHA-256 of their URL and
 * streamed to disk, so large weights never sit in memory.
 */
export interface FileCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export function opfsCache(
  directoryName = 'soverius-transformers',
  root: () => Promise<FileSystemDirectoryHandle> = () =>
    navigator.storage.getDirectory(),
): FileCache {
  const directory = async () =>
    (await root()).getDirectoryHandle(directoryName, { create: true });

  return {
    async match(key) {
      try {
        const handle = await (
          await directory()
        ).getFileHandle(await fileName(key));
        return new Response(await handle.getFile());
      } catch {
        return undefined;
      }
    },

    async put(key, response) {
      if (!response.body) return;
      const name = await fileName(key);
      const folder = await directory();
      const handle = await folder.getFileHandle(name, { create: true });
      try {
        await response.body.pipeTo(await handle.createWritable());
      } catch (error) {
        // Never leave a half-written file that would look cached.
        await folder.removeEntry(name).catch(() => undefined);
        throw error;
      }
    },

    async delete(key) {
      try {
        await (await directory()).removeEntry(await fileName(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

async function fileName(key: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(key),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
