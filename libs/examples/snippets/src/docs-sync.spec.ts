import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Code blocks of the docs and the README titled with a repository file (```ts title="libs/examples/snippets/src/chat.ts")
 * must be that file, unchanged: the docs show the code these tests run.
 */
const repository = join(import.meta.dirname, '../../../..');
const docs = join(repository, 'apps/docs/docs');
const BLOCK = /^```\w+ title="((?:apps|libs)\/[^"]+)"\n([\s\S]*?)^```$/gm;

function pages(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'api' ? [] : pages(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

const blocks = [...pages(docs), join(repository, 'README.md')].flatMap((page) =>
  [...readFileSync(page, 'utf8').matchAll(BLOCK)].map(
    ([, file = '', code]) => ({
      page: relative(repository, page),
      file,
      code,
    }),
  ),
);

it('finds the snippets in the docs', () => {
  expect(blocks.map(({ file }) => file)).toEqual(
    expect.arrayContaining([
      'libs/examples/snippets/src/chat.ts',
      'libs/examples/snippets/src/agent.ts',
      'libs/examples/snippets/src/tools.ts',
      'libs/examples/snippets/src/copilotkit.tsx',
    ]),
  );
});

it.each(blocks)('$page shows $file as it is', ({ file, code }) => {
  expect(code).toBe(readFileSync(join(repository, file), 'utf8'));
});
