import { defaultClientConditions, defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/engine-chat',
  server: {
    port: 4204,
    host: 'localhost',
  },
  preview: {
    port: 4304,
    host: 'localhost',
  },
  resolve: {
    tsconfigPaths: true,
    // transformers.js loads ONNX Runtime's wasm itself (from its CDN by default). This official
    // condition stops Vite from also emitting a 26 MB copy that is never used.
    conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
  },
  plugins: [tailwindcss(), nxReadySignal()],
  build: {
    outDir: '../../dist/apps/engine-chat',
    emptyOutDir: true,
  },
  test: {
    name: 'engine-chat',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/engine-chat',
      provider: 'v8' as const,
    },
  },
}));
