import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Engine, EnginePart } from '../lib/engine.ts';
import type { FakeModel } from './fake-model.ts';

const messages = [{ role: 'user' as const, content: 'Hi' }];

/** The text of a reply. */
export async function collect(
  stream: AsyncIterable<EnginePart>,
): Promise<string> {
  let text = '';
  for await (const part of stream) if (part.type === 'text') text += part.text;
  return text;
}

/**
 * Registers the tests every engine has to pass: the behaviour the agent and the model store
 * rely on. `create` returns a new engine whose library is mocked with `model`.
 */
export function describeEngineContract(
  model: FakeModel,
  create: () => Engine,
): void {
  describe('engine contract', () => {
    let engine: Engine;

    beforeEach(() => {
      model.reset();
      engine = create();
    });

    /** Resolves once the library is loading the model. */
    const loadStarted = () => vi.waitFor(() => expect(model.pending).toBe(1));

    /** Downloads and loads the model. */
    async function load(): Promise<void> {
      const done = engine.load();
      await loadStarted();
      model.finishLoad();
      await done;
    }

    it('reports downloadable, then downloading, then available', async () => {
      expect(await engine.availability()).toBe('downloadable');

      const done = engine.load();
      await loadStarted();
      expect(await engine.availability()).toBe('downloading');

      model.finishLoad();
      await done;
      expect(await engine.availability()).toBe('available');
    });

    it('shares one load and gives every caller progress', async () => {
      const first: number[] = [];
      const second: number[] = [];
      const done = Promise.all([
        engine.load({ onProgress: (fraction) => first.push(fraction) }),
        engine.load({ onProgress: (fraction) => second.push(fraction) }),
      ]);
      await loadStarted();
      model.progress(0.5);
      model.finishLoad();
      await done;

      expect(first).toEqual([0.5]);
      expect(second).toEqual([0.5]);
      expect(model.live).toBeLessThanOrEqual(1);
    });

    it('rejects only the caller that aborts a load', async () => {
      const abort = new AbortController();
      const aborted = engine.load({ signal: abort.signal });
      const patient = engine.load();
      await loadStarted();

      abort.abort();
      await expect(aborted).rejects.toThrow('aborted');
      model.finishLoad();
      await expect(patient).resolves.toBeUndefined();
    });

    it('lets a failed load be retried', async () => {
      const failed = engine.load();
      await loadStarted();
      model.failLoad(new Error('offline'));
      await expect(failed).rejects.toThrow('offline');
      expect(await engine.availability()).toBe('downloadable');

      await load();
      expect(await engine.availability()).toBe('available');
    });

    it('streams the reply and ends with a finish part', async () => {
      await load();
      const parts: EnginePart[] = [];
      for await (const part of engine.generate({ messages })) parts.push(part);

      expect(parts.slice(0, 2)).toEqual([
        { type: 'text', text: 'Hel' },
        { type: 'text', text: 'lo' },
      ]);
      expect(parts).toHaveLength(3);
      expect(parts[2]).toMatchObject({ type: 'finish', reason: 'stop' });
      expect(model.stopped).toBe(false);
    });

    it('throws from generate when aborted, although the library ends quietly', async () => {
      await load();
      const abort = new AbortController();
      const reply = engine.generate({ messages, signal: abort.signal });
      const parts: EnginePart[] = [];

      await expect(
        (async () => {
          for await (const part of reply) {
            parts.push(part);
            abort.abort();
          }
        })(),
      ).rejects.toThrow('aborted');
      expect(parts).toEqual([{ type: 'text', text: 'Hel' }]);
      expect(model.stopped).toBe(true);
    });

    it('stops generating when the caller stops reading', async () => {
      await load();
      for await (const part of engine.generate({ messages })) {
        expect(part).toEqual({ type: 'text', text: 'Hel' });
        break;
      }
      expect(model.stopped).toBe(true);
    });

    it('frees the model on unload and loads it again afterwards', async () => {
      await load();
      await collect(engine.generate({ messages }));
      expect(model.live).toBe(1);

      await engine.unload();
      expect(model.live).toBe(0);
      expect(model.downloaded).toBe(true);

      expect(await collect(engine.generate({ messages }))).toBe('Hello');
      expect(model.live).toBe(1);
    });

    it('rejects waiting callers when unloaded during a load', async () => {
      const waiting = engine.load();
      await loadStarted();

      await engine.unload();
      await expect(waiting).rejects.toThrow('unloaded');
      model.finishLoad(); // a library that cannot stop its load finishes it anyway
      await vi.waitFor(() => expect(model.live).toBe(0));
    });

    it('unloads before it deletes the files', async ({ skip }) => {
      if (!engine.delete) skip(); // the browser owns the Prompt API model
      await load();
      await collect(engine.generate({ messages }));

      await engine.delete?.();
      expect(model.live).toBe(0);
      expect(model.downloaded).toBe(false);
    });

    it('leaves no files behind when deleted during a load', async ({
      skip,
    }) => {
      if (!engine.delete) skip();
      const loading = engine.load().catch(() => undefined);
      await loadStarted();

      const deleted = engine.delete?.();
      model.finishLoad(); // a library that cannot stop its download finishes it
      await deleted;
      await loading;

      expect(model.downloaded).toBe(false);
      expect(model.live).toBe(0);
      expect(await engine.availability()).toBe('downloadable');
    });
  });
}
