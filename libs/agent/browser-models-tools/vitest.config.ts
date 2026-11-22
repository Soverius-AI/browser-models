import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/agent/browser-models-tools',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'browser-models-tools',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/agent/browser-models-tools',
      provider: 'v8' as const,
    },
  },
}));
