import type { Engine } from './lib/engine.ts';
import { Models } from './models.ts';

const engine = (id: string): Engine => ({
  id,
  supportsConstraint: false,
  availability: async () => 'available',
  load: async () => undefined,
  unload: async () => undefined,
  async *generate() {
    yield { type: 'text', text: id };
  },
});

describe('Models', () => {
  it('starts with the default model and switches only to registered ones', () => {
    const models = new Models({ a: engine('a'), b: engine('b') }, 'a');

    expect(models.modelIds).toEqual(['a', 'b']);
    expect(models.engine().id).toBe('a');
    models.selectModel('b');
    expect(models.selectedModel).toBe('b');
    expect(models.engine('a').id).toBe('a');
    expect(() => models.selectModel('c' as 'a')).toThrow('Unknown model "c".');
  });

  it('needs a registered default model', () => {
    expect(() => new Models({ a: engine('a') }, 'b' as 'a')).toThrow(
      'defaultModel "b" is not one of the registered models.',
    );
  });

  it('tells whether an id from outside is registered', () => {
    const models = new Models({ a: engine('a') }, 'a');

    expect(models.has('a')).toBe(true);
    expect(models.has('toString')).toBe(false);
  });
});
