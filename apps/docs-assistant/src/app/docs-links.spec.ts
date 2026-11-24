import { DocsLinks } from './docs-links';

describe('DocsLinks', () => {
  const links = new DocsLinks([
    '/docs',
    '/docs/examples',
    '/docs/engines/streaming',
    '/docs/api/browser-models/core',
  ]);

  describe('complete', () => {
    it('makes a bare [/docs/…] a link to that page', () => {
      expect(
        DocsLinks.complete('**Usage:** [/docs/api/browser-models/core#usage]'),
      ).toBe(
        '**Usage:** [/docs/api/browser-models/core#usage](/docs/api/browser-models/core#usage)',
      );
    });

    it('makes a plain /docs/… path a link, without the sentence end', () => {
      expect(
        DocsLinks.complete(
          'The examples are at /docs/examples. Token counts: /docs/agent/compaction#token-counts',
        ),
      ).toBe(
        'The examples are at [/docs/examples](/docs/examples). Token counts: [/docs/agent/compaction#token-counts](/docs/agent/compaction#token-counts)',
      );
    });

    it('makes code that is only a docs path a link', () => {
      expect(
        DocsLinks.complete(
          'Examples: `/docs/examples`, overview: `/docs#copilotkit`',
        ),
      ).toBe(
        'Examples: [/docs/examples](/docs/examples), overview: [/docs#copilotkit](/docs#copilotkit)',
      );
    });

    it('leaves paths in code as they are', () => {
      const text = 'Run `open /docs/examples` or see https://x.dev/docs/a';
      expect(DocsLinks.complete(text)).toBe(text);
    });

    it('leaves links, other brackets and other paths as they are', () => {
      const text =
        '[Streaming](/docs/engines/streaming) [/docs/tools](/docs/tools) [x] [/blog/post]';
      expect(DocsLinks.complete(text)).toBe(text);
    });
  });

  describe('resolve', () => {
    it.each([
      [
        '/docs/api/browser-models/core#usage',
        '/docs/api/browser-models/core#usage',
      ],
      ['/docs/examples/', '/docs/examples'],
      [
        'https://browser-models.soverius.ai/docs/engines/streaming',
        '/docs/engines/streaming',
      ],
      // Invented docs sites go to the page they name.
      [
        'https://browser-models.readthedocs.io/en/latest/examples/',
        '/docs/examples',
      ],
      [
        'https://soverius-ai.github.io/browser-models/docs/engines/streaming.html',
        undefined,
      ],
    ])('%s → docs page %s', (href, url) => {
      expect(links.resolve(href)).toEqual(
        url ? { kind: 'docs', url } : { kind: 'none' },
      );
    });

    it('keeps outside links, and drops invented pages with no page here', () => {
      expect(links.resolve('https://docs.ag-ui.com/concepts')).toEqual({
        kind: 'external',
        url: 'https://docs.ag-ui.com/concepts',
      });
      expect(
        links.resolve(
          'https://browser-models.readthedocs.io/en/latest/plugins/',
        ),
      ).toEqual({ kind: 'none' });
    });
  });
});
