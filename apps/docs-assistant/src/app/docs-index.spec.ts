import { DocsIndex } from './docs-index';

const files = {
  '../../../docs/docs/intro.md': `---
slug: /
title: Overview
---

# browser-models

Language models in the browser.

## Install

\`\`\`bash
# not a heading
pnpm add @soverius-ai/browser-models
\`\`\`
`,
  '../../../docs/docs/engines/index.md': `---
title: Choose an engine
---

# Choose an engine

## Is the Prompt API there?

\`availability()\` downloads nothing. Gemini Nano runs in Chrome.

\`\`\`mermaid
flowchart LR
  secret --> diagram
\`\`\`

### All engines by kind

Engines.create builds any engine.
`,
};

describe('DocsIndex', () => {
  const docs = DocsIndex.fromFiles(files);

  it('splits pages at their headings, with urls and anchors like Docusaurus', () => {
    expect(
      docs.sections.map(({ id, page, title, url }) => ({
        id,
        page,
        title,
        url,
      })),
    ).toEqual([
      { id: 'intro#', page: 'Overview', title: 'Overview', url: '/docs' },
      {
        id: 'intro#install',
        page: 'Overview',
        title: 'Install',
        url: '/docs#install',
      },
      {
        id: 'engines/index#is-the-prompt-api-there',
        page: 'Choose an engine',
        title: 'Is the Prompt API there?',
        url: '/docs/engines#is-the-prompt-api-there',
      },
      {
        id: 'engines/index#all-engines-by-kind',
        page: 'Choose an engine',
        title: 'All engines by kind',
        url: '/docs/engines#all-engines-by-kind',
      },
    ]);
  });

  it('keeps code, but not diagrams or comments taken for headings', () => {
    expect(docs.section('intro#install')?.text).toContain('# not a heading');
    expect(
      docs.section('engines/index#is-the-prompt-api-there')?.text,
    ).not.toContain('secret');
  });

  it('ranks the section whose title matches first', () => {
    const [best] = docs.search('how do I check the Prompt API');
    expect(best).toMatchObject({
      title: 'Is the Prompt API there?',
      url: '/docs/engines#is-the-prompt-api-there',
    });
    expect(best?.excerpt).toContain('Gemini Nano');
  });

  it('shows excerpts without code fences and table syntax', () => {
    const table = DocsIndex.fromFiles({
      '../../../docs/docs/settings.md':
        '# Settings\n\n| Setting | Engine |\n| --- | --- |\n| `sampling` | all |\n\n```ts\nnew Engine();\n```\n',
    });
    expect(table.search('sampling')[0]?.excerpt).toBe(
      'Setting · Engine `sampling` · all new Engine();',
    );
  });

  it('finds nothing for words the docs do not have', () => {
    expect(docs.search('kubernetes')).toEqual([]);
    expect(docs.search('the of')).toEqual([]);
  });

  it('builds from the real docs of this site', async () => {
    const site = DocsIndex.fromFiles(
      import.meta.glob<string>('../../../docs/docs/**/*.md', {
        query: '?raw',
        import: 'default',
        eager: true,
      }),
    );
    expect(site.sections.length).toBeGreaterThan(50);
    expect(site.search('compaction summary')[0]?.url).toMatch(
      /^\/docs\/(agent\/compaction|architecture\/context)/,
    );
  });
});
