/// <reference types='vitest' />
import { defineConfig } from 'vite';

// Tests only. The package is built by tools/library-build.ts (esbuild and tsc).
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/frameworks/vue',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'vue',
    passWithNoTests: true,
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/frameworks/vue',
      provider: 'v8' as const,
    },
  },
}));
