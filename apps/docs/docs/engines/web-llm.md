---
title: WebLLM
---

# WebLLM

Models compiled for WebGPU, for example `Qwen3-0.6B-q4f16_1-MLC` or `gemma-4-E2B-it-q4f16_1-MLC`.

```bash
pnpm add @mlc-ai/web-llm
```

```ts
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';

new WebLlmEngine('gemma-4-E2B-it-q4f16_1-MLC', {
  contextWindowSize: 16384,
  sampling: 'predictable',
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

| Option              | Default                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `worker`            | none: runs on the main thread                                          |
| `appConfig`         | WebLLM's `prebuiltAppConfig` (Cache API)                               |
| `contextWindowSize` | the model's build value: `4096` for most, `2048`/`1024` for small ones |
| `maxOutputTokens`   | until the model stops or the context is full                           |
| `sampling`          | the model's own temperature                                            |
| `native`            | WebLLM's `ChatOptions`, passed to `reload()`; the settings above win   |

| Behaviour    |                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------- |
| storage      | Cache API; OPFS with `appConfig: { ...prebuiltAppConfig, cacheBackend: 'opfs' }`         |
| context full | the call fails with `ContextWindowSizeExceededError`; the agent's compaction prevents it |
| token counts | `promptTokens`, `outputTokens`, `totalTokens` (`include_usage`)                          |
| finish       | `length` when `maxOutputTokens` cut the reply                                            |
| GPU memory   | grows with `contextWindowSize`                                                           |

`4096` tokens fill quickly with tools: tool descriptions plus one long result. Use `16384` for tool calling, MCP and generative UI.

API: [web-llm](../api/browser-models/web-llm.md)
