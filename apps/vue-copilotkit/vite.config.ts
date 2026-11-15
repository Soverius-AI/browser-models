/// <reference types='vitest' />
import { defaultClientConditions, defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/vue-copilotkit',
  server: {
    port: 4202,
    host: 'localhost',
  },
  preview: {
    port: 4302,
    host: 'localhost',
  },
  resolve: {
    tsconfigPaths: true,
    // transformers.js loads ONNX Runtime's wasm itself (from its CDN by default). This official
    // condition stops Vite from also emitting a 26 MB copy that is never used.
    conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
  },
  plugins: [vue(), tailwindcss(), nxReadySignal()],
  build: {
    outDir: '../../dist/apps/vue-copilotkit',
    emptyOutDir: true,
  },
  test: {
    name: 'vue-copilotkit',
    watch: false,
    globals: true,
    environment: 'jsdom',
    // CopilotKit imports its CSS from JavaScript; let Vite process it instead of Node.
    server: { deps: { inline: [/@copilotkit\//] } },
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/vue-copilotkit',
      provider: 'v8' as const,
    },
  },
}));
