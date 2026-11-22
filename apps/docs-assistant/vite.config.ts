/// <reference types='vitest' />
import { defaultClientConditions, defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/docs-assistant',
  server: {
    port: 4206,
    host: 'localhost',
  },
  preview: {
    port: 4306,
    host: 'localhost',
  },
  resolve: {
    tsconfigPaths: true,
    // transformers.js loads ONNX Runtime's wasm itself (from its CDN by default). This official
    // condition stops Vite from also emitting a 26 MB copy that is never used.
    conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
  },
  plugins: [react(), tailwindcss(), nxReadySignal()],
  build: {
    outDir: '../../dist/apps/docs-assistant',
    emptyOutDir: true,
  },
  test: {
    name: 'docs-assistant',
    watch: false,
    globals: true,
    environment: 'jsdom',
    // CopilotKit imports its CSS from JavaScript; let Vite process it instead of Node.
    server: { deps: { inline: [/@copilotkit\//] } },
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/docs-assistant',
      provider: 'v8' as const,
    },
  },
}));
