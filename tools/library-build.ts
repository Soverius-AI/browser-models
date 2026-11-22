/**
 * Builds a library for npm:
 * - JavaScript with esbuild: one minified ES module per entry point of `package.json` `exports`,
 *   code shared between entry points in chunks (nothing twice), dependencies left as imports;
 * - type declarations with tsc, with their doc comments, for editors;
 * - `package.json`, README and LICENSE.
 *
 * `node tools/library-build.ts <project root> <out dir> [--entry src/file.ts]…`
 * An `--entry` is an extra entry point that is not in `exports`, such as a worker file the
 * library starts with `new Worker(new URL('./name.js', import.meta.url))`.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

interface PackageJson {
  readonly exports?: Readonly<
    Record<
      string,
      string | { readonly import?: string; readonly default?: string }
    >
  >;
}

class LibraryBuild {
  readonly #root: string;
  readonly #out: string;
  readonly #extraEntries: readonly string[];

  constructor(root: string, out: string, extraEntries: readonly string[]) {
    this.#root = resolve(root);
    this.#out = resolve(out);
    this.#extraEntries = extraEntries;
  }

  async run(): Promise<void> {
    rmSync(this.#out, { recursive: true, force: true });
    await this.#javascript();
    this.#declarations();
    for (const file of ['package.json', 'README.md'])
      copyFileSync(join(this.#root, file), join(this.#out, file));
    copyFileSync('LICENSE', join(this.#out, 'LICENSE'));
  }

  /**
   * Entry points from `exports`: `./prompt-api.js` is built from `src/prompt-api.ts`, `.`
   * (`./index.js`) from `src/index.ts`.
   */
  #entries(): { in: string; out: string }[] {
    const pkg = JSON.parse(
      readFileSync(join(this.#root, 'package.json'), 'utf8'),
    ) as PackageJson;
    const files = Object.values(pkg.exports ?? {}).flatMap((target) => {
      const file =
        typeof target === 'string' ? target : (target.import ?? target.default);
      return file?.endsWith('.js') ? [file.slice(2, -3)] : [];
    });
    return [
      ...files.map((name) => ({
        in: join(this.#root, 'src', `${name}.ts`),
        out: name,
      })),
      ...this.#extraEntries.map((file) => ({
        in: join(this.#root, file),
        out: basename(file).replace(/\.ts$/, ''),
      })),
    ];
  }

  async #javascript(): Promise<void> {
    await build({
      entryPoints: this.#entries(),
      outdir: this.#out,
      // Chunks sit next to the entry points, so `new URL('./x.js', import.meta.url)` in a
      // chunk still finds an entry point such as a worker.
      chunkNames: '[name]-[hash]',
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      minify: true,
      treeShaking: true,
      // Dependencies, peers and the other packages of this repository stay imports.
      packages: 'external',
      legalComments: 'none',
      tsconfig: join(this.#root, 'tsconfig.lib.json'),
      logLevel: 'warning',
    });
  }

  /**
   * The other packages of this repository, as their built declarations: the repository's
   * `paths` point to their sources, which tsc would otherwise emit declarations for too.
   */
  #builtPaths(): Record<string, string[]> {
    const base = JSON.parse(readFileSync('tsconfig.base.json', 'utf8')) as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    return Object.fromEntries(
      Object.entries(base.compilerOptions.paths)
        .filter(([name]) => name.startsWith('@soverius-ai/'))
        .map(([name, [source = '']]) => [
          name,
          [
            resolve(
              'dist',
              source.replace('/src/', '/').replace(/\.ts$/, '.d.ts'),
            ),
          ],
        ]),
    );
  }

  #declarations(): void {
    const config = join(this.#out, 'tsconfig.declarations.json');
    writeFileSync(
      config,
      JSON.stringify({
        extends: join(this.#root, 'tsconfig.lib.json'),
        compilerOptions: { paths: this.#builtPaths() },
      }),
    );
    execFileSync(
      resolve('node_modules/.bin/tsc'),
      [
        '-p',
        config,
        '--declaration',
        '--emitDeclarationOnly',
        '--sourceMap',
        'false',
        '--outDir',
        this.#out,
        '--rootDir',
        join(this.#root, 'src'),
      ],
      { stdio: 'inherit' },
    );
    rmSync(config);
  }
}

const [root, out, ...rest] = process.argv.slice(2);
if (!root || !out)
  throw new Error(
    'Usage: library-build.ts <project root> <out dir> [--entry file]…',
  );
const extra = rest.flatMap((arg, index) =>
  rest[index - 1] === '--entry' ? [arg] : [],
);
await new LibraryBuild(root, out, extra).run();
