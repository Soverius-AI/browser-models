import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/examples/snippets',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'example-snippets',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/testing/setup.ts'],
    // CopilotKit imports its CSS from JavaScript; let Vite process it instead of Node.
    server: { deps: { inline: [/@copilotkit\//] } },
    include: ['src/**/*.spec.{ts,tsx}'],
    reporters: ['default'],
  },
});
