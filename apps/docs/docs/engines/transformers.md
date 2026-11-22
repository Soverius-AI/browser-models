---
title: transformers.js
---

# transformers.js

ONNX models from the Hugging Face Hub, on WebGPU or WASM.

```bash
pnpm add @huggingface/transformers
```

```ts
import { TransformersJsEngine } from '@soverius-ai/browser-models/transformers';

new TransformersJsEngine('onnx-community/Qwen3-0.6B-ONNX', {
  maxOutputTokens: 1024,
  sampling: 'balanced',
  storage: 'opfs',
});
new TransformersJsEngine('onnx-community/gemma-4-E4B-it-ONNX', {
  task: 'image-text-to-text', // multimodal models; they get text only
});
```

| Option              | Values                                                          | Default                           |
| ------------------- | --------------------------------------------------------------- | --------------------------------- |
| `task`              | `'text-generation'`, `'image-text-to-text'` (`AutoProcessor`)   | `'text-generation'`               |
| `device`            | `'webgpu'`, `'wasm'`                                            | `'webgpu'`                        |
| `dtype`             | `'q4f16'`, `'q4'`, `'q8'`, `'fp16'`, `'fp32'`                   | `'q4f16'` (WebGPU), `'q4'` (WASM) |
| `maxOutputTokens`   | longest reply                                                   | `1024`                            |
| `sampling`          | see [Settings](./settings.md)                                   | always the likeliest word         |
| `contextWindowSize` | the [compaction](../agent/compaction.md) budget                 | none: never compacted             |
| `storage`           | `'cache-api'`, `'opfs'` (global for all transformers.js models) | `'cache-api'`                     |
| `native`            | transformers.js generation settings; the settings above win     | –                                 |

| Behaviour    |                                                                       |
| ------------ | --------------------------------------------------------------------- |
| context size | the model's own maximum; nothing stops a long conversation but memory |
| token counts | its tokenizer: prompt and reply                                       |
| finish       | `length` when `maxOutputTokens` is reached                            |

ONNX Runtime loads its wasm from a CDN. With Vite, add the official condition, or Vite emits an unused 26 MB copy:

```ts
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
  },
});
```

API: [transformers](../api/browser-models/transformers.md)
