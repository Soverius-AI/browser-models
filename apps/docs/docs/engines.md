---
title: Engines
---

# Engines

| Class                  | Entry           | `id`                      | `supportsConstraint`       | `delete()` |
| ---------------------- | --------------- | ------------------------- | -------------------------- | ---------- |
| `PromptApiEngine`      | `/prompt-api`   | `prompt-api`              | yes (`responseConstraint`) | no         |
| `WebLlmEngine`         | `/web-llm`      | `web-llm:<model id>`      | yes (`response_format`)    | yes        |
| `TransformersJsEngine` | `/transformers` | `transformers:<model id>` | no                         | yes        |

WebLLM and transformers.js are imported on first use, so they are not in the initial bundle.

## Prompt API

```ts
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

new PromptApiEngine({ languages: ['en', 'de'] });
```

| Option          | Default                |
| --------------- | ---------------------- |
| `languages`     | `['en']`               |
| `languageModel` | global `LanguageModel` |

- The browser owns the model, so there is no `delete()`.
- `load()` may need a user gesture.
- The session is reused while the conversation continues.

## WebLLM

```ts
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';

new WebLlmEngine('Qwen3-0.6B-q4f16_1-MLC', {
  worker: () =>
    new Worker(new URL('./web-llm.worker.ts', import.meta.url), {
      type: 'module',
    }),
});
```

```ts
// web-llm.worker.ts
import { startWebLlmWorker } from '@soverius-ai/browser-models/web-llm/worker';
startWebLlmWorker();
```

| Option      | Default                                  |
| ----------- | ---------------------------------------- |
| `worker`    | none: runs on the main thread            |
| `appConfig` | WebLLM's `prebuiltAppConfig` (Cache API) |

OPFS: `appConfig: { ...prebuiltAppConfig, cacheBackend: 'opfs' }`.

## transformers.js

```ts
import { TransformersJsEngine } from '@soverius-ai/browser-models/transformers';

new TransformersJsEngine('onnx-community/Qwen3-0.6B-ONNX');
new TransformersJsEngine('onnx-community/gemma-4-E4B-it-ONNX', {
  task: 'image-text-to-text',
});
```

| Option         | Values                                                          | Default                           |
| -------------- | --------------------------------------------------------------- | --------------------------------- |
| `task`         | `'text-generation'`, `'image-text-to-text'` (`AutoProcessor`)   | `'text-generation'`               |
| `device`       | `'webgpu'`, `'wasm'`                                            | `'webgpu'`                        |
| `dtype`        | `'q4f16'`, `'q4'`, `'q8'`, `'fp16'`, `'fp32'`                   | `'q4f16'` (WebGPU), `'q4'` (WASM) |
| `maxNewTokens` | `number`                                                        | `1024`                            |
| `storage`      | `'cache-api'`, `'opfs'` (global for all transformers.js models) | `'cache-api'`                     |

`image-text-to-text` models get text only.

transformers.js loads ONNX Runtime's wasm from a CDN. With Vite, add the official `onnxruntime-web-use-extern-wasm` condition, or Vite emits an unused 26 MB copy:

```ts
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
  },
});
```

## Custom engine

```ts
import type { Engine } from '@soverius-ai/browser-models';

const echo: Engine = {
  id: 'echo',
  supportsConstraint: false,
  availability: async () => 'available',
  load: async () => undefined,
  unload: async () => undefined,
  async *generate({ messages }) {
    yield messages.at(-1)?.content ?? '';
  },
};
```

| Member                                       | Purpose                                                      |
| -------------------------------------------- | ------------------------------------------------------------ |
| `id`                                         | stable id, shown as `engineId` in [Model state](./models.md) |
| `supportsConstraint`                         | `generate()` can force JSON Schema output with `constraint`  |
| `availability()`                             | `available` · `downloadable` · `downloading` · `unavailable` |
| `load({ onProgress, signal })`               | download and load                                            |
| `generate({ messages, constraint, signal })` | stream text; throws when `signal` aborts                     |
| `unload()`                                   | free memory, GPU buffers, worker; stop a load in progress    |
| `delete()`                                   | optional: unload, then remove the download                   |
