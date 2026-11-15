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

## Context size

The context holds everything the model reads and writes in a run: system prompt, tool descriptions, the conversation, tool results and the reply. The defaults are small.

| Engine          | Default when nothing is passed                                                                                   | Set it with                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| WebLLM          | the value the model was built with: `4096` tokens for most prebuilt models, `2048` or `1024` for some small ones | `contextWindowSize`                             |
| transformers.js | the model's own maximum; the library sets no window                                                              | nothing to set; `maxNewTokens` limits the reply |
| Prompt API      | set by the browser (`session.contextWindow`)                                                                     | not possible                                    |

```ts
new WebLlmEngine('gemma-4-E2B-it-q4f16_1-MLC', { contextWindowSize: 16384 });
```

| When the context is full | What happens                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| WebLLM                   | the run ends with `RUN_ERROR`: `ContextWindowSizeExceededError`                                        |
| transformers.js          | nothing stops the run; a very long conversation can run out of GPU memory                              |
| Prompt API               | the browser drops the oldest turns; a single prompt that is too long fails with a `QuotaExceededError` |

- `4096` tokens fill quickly with tools: the tool descriptions plus one long tool result are enough. Use `16384` for tool calling, MCP servers and [Open Generative UI](./generative-ui.md). The examples do.
- A larger window needs more GPU memory.
- Keep tool results short: [`maxResultLength`](./tools.md#mcp) of `McpTools` cuts long ones.

## Prompt API

```ts
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

new PromptApiEngine({ languages: ['en', 'de'] });
```

| Option          | Default                |
| --------------- | ---------------------- |
| `languages`     | `['en']`               |
| `languageModel` | global `LanguageModel` |

- The browser owns the model, so there is no `delete()`, and no setting for the [context size](#context-size).
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

| Option              | Default                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| `worker`            | none: runs on the main thread                                                 |
| `appConfig`         | WebLLM's `prebuiltAppConfig` (Cache API)                                      |
| `contextWindowSize` | the model's build value, mostly `4096` tokens ([Context size](#context-size)) |
| `chatOptions`       | none; WebLLM's `ChatOptions`, passed to `reload()` as they are                |

OPFS: `appConfig: { ...prebuiltAppConfig, cacheBackend: 'opfs' }`.

```ts
new WebLlmEngine('Qwen3-0.6B-q4f16_1-MLC', {
  contextWindowSize: 16384,
  chatOptions: { temperature: 0.2, top_p: 0.9, repetition_penalty: 1.05 },
});
```

`contextWindowSize` wins over `chatOptions.context_window_size`.

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
| `maxNewTokens` | `number`: longest reply in tokens                               | `1024`                            |
| `generation`   | transformers.js generation settings, passed to every run        | `{ do_sample: false }`            |
| `storage`      | `'cache-api'`, `'opfs'` (global for all transformers.js models) | `'cache-api'`                     |

`image-text-to-text` models get text only.

```ts
new TransformersJsEngine('onnx-community/Qwen3-0.6B-ONNX', {
  maxNewTokens: 2048,
  generation: { do_sample: true, temperature: 0.7, top_p: 0.9 },
});
```

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
