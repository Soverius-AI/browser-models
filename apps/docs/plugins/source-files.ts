import type { LoadContext, Plugin } from '@docusaurus/types';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SOURCE_FILES } from '../src/source-files';

/**
 * Reads the files of `SOURCE_FILES` at build time. Pages get them with
 * `usePluginData('source-files')`: file path → content.
 */
export default function sourceFiles({ siteDir }: LoadContext): Plugin {
  const repository = resolve(siteDir, '../..');
  const paths = [...new Set(Object.values(SOURCE_FILES).flat())];
  return {
    name: 'source-files',
    async loadContent() {
      const contents = await Promise.all(
        paths.map((path) => readFile(resolve(repository, path), 'utf8')),
      );
      return Object.fromEntries(
        paths.map((path, index) => [path, contents[index] ?? '']),
      );
    },
    async contentLoaded({ content, actions }) {
      actions.setGlobalData(content);
    },
    getPathsToWatch: () => paths.map((path) => resolve(repository, path)),
  };
}
