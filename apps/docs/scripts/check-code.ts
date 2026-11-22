/**
 * Typechecks every ```ts and ```tsx block of the docs (`apps/docs/docs`, without the generated
 * `api/`) and of the README. Each block becomes one module; `code-prelude.d.ts` declares the few
 * names a block may use without defining them.
 *
 * - A block whose first line is `// name.ts` is written as `name.ts`, so the other blocks of
 *   the same page can import it (`import { agent } from './agent'`).
 * - Skipped: ```ts no-check, and blocks titled with a repository file
 *   (```ts title="libs/…"), which are that file and tested there.
 *
 * Run: `node apps/docs/scripts/check-code.ts` (or `pnpm nx run docs:check-code`).
 */
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';

/** One code block, written to `file`. */
interface Block {
  /** The page, relative to the repository. */
  readonly page: string;
  /** Line of the opening fence in the page. */
  readonly fence: number;
  /** The generated module, relative to the output directory. */
  readonly file: string;
  readonly code: string;
}

const FENCE = /^```(tsx?)((?:[ \t][^\n]*)?)\n([\s\S]*?)^```[ \t]*$/gm;
const FILE_NAME = /^\/\/ ([\w.-]+\.tsx?)\n/;
const REPOSITORY_FILE = /\btitle="(?:apps|libs)\//;
const ERROR = /^(.+?)\((\d+),(\d+)\): (error .*)$/;

class DocsCode {
  readonly #root = join(import.meta.dirname, '../../..');
  readonly #out = join(this.#root, 'node_modules/.cache/docs-code');
  readonly #prelude = join(import.meta.dirname, 'code-prelude.d.ts');

  /** Extracts the blocks, typechecks them and returns the exit code. */
  run(): number {
    const blocks = this.#pages().flatMap((page) => this.#blocks(page));
    const clash = this.#clash(blocks);
    if (clash) {
      console.error(clash);
      return 1;
    }
    this.#write(blocks);
    const result = spawnSync(
      process.execPath,
      [this.#tsc(), '--noEmit', '--pretty', 'false', '-p', this.#out],
      { encoding: 'utf8' },
    );
    const output = this.#output(`${result.stdout}${result.stderr}`, blocks);
    for (const line of output) console.error(line);
    const errors = output.filter((line) => / error TS\d+:/.test(line)).length;
    console.log(
      `${blocks.length} code blocks, ${errors} error${errors === 1 ? '' : 's'}`,
    );
    return result.status === 0 ? 0 : 1;
  }

  #pages(): string[] {
    const docs = join(this.#root, 'apps/docs/docs');
    return [join(this.#root, 'README.md'), ...DocsCode.#markdown(docs)];
  }

  static #markdown(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory())
          return entry.name === 'api' ? [] : DocsCode.#markdown(path);
        return entry.name.endsWith('.md') ? [path] : [];
      });
  }

  #blocks(path: string): Block[] {
    const page = relative(this.#root, path);
    const text = readFileSync(path, 'utf8');
    const folder = page.replace(/\.md$/, '');
    return [...text.matchAll(FENCE)].flatMap((match) => {
      const [, language = 'ts', meta = '', code = ''] = match;
      if (/\bno-check\b/.test(meta) || REPOSITORY_FILE.test(meta)) return [];
      const fence = text.slice(0, match.index).split('\n').length;
      const name = FILE_NAME.exec(code)?.[1] ?? `L${fence}.${language}`;
      return [{ page, fence, file: join(folder, name), code }];
    });
  }

  /** Two blocks of a page named the same file. */
  #clash(blocks: readonly Block[]): string | undefined {
    const seen = new Map<string, Block>();
    for (const block of blocks) {
      const other = seen.get(block.file);
      if (other)
        return `${block.page}:${block.fence}: ${block.file} is also the block at line ${other.fence}`;
      seen.set(block.file, block);
    }
    return undefined;
  }

  #write(blocks: readonly Block[]): void {
    rmSync(this.#out, { recursive: true, force: true });
    for (const block of blocks) {
      const path = join(this.#out, block.file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${block.code}export {};\n`);
    }
    const config = {
      extends: join(this.#root, 'tsconfig.base.json'),
      compilerOptions: {
        jsx: 'react-jsx',
        lib: ['es2024', 'dom', 'dom.iterable'],
        types: ['vite/client'],
        noEmit: true,
      },
      files: [this.#prelude, ...blocks.map((block) => block.file)],
    };
    writeFileSync(
      join(this.#out, 'tsconfig.json'),
      JSON.stringify(config, null, 2),
    );
  }

  #tsc(): string {
    return createRequire(import.meta.url).resolve('typescript/bin/tsc');
  }

  /** tsc's output, with the page and line of the block for the generated files. */
  #output(output: string, blocks: readonly Block[]): string[] {
    const byFile = new Map(
      blocks.map((block) => [join(this.#out, block.file), block]),
    );
    return output
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [, file = '', row = '0', column = '0', message = line] =
          ERROR.exec(line) ?? [];
        const block = byFile.get(resolve(file));
        if (!block) return line;
        const lines = block.code.split('\n').length - 1;
        return `${block.page}:${block.fence + Math.min(Number(row), lines)}:${column} ${message}`;
      });
  }
}

process.exitCode = new DocsCode().run();
