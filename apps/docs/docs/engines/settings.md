---
title: Settings
---

# Settings

`ModelSettings` mean the same for every engine, and every engine takes them. One object can set up all three; each engine's own options spread over it.

```ts
import type { ModelSettings } from '@soverius-ai/browser-models';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { TransformersJsEngine } from '@soverius-ai/browser-models/transformers';
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';

const settings: ModelSettings = {
  contextWindowSize: 16384,
  maxOutputTokens: 1024,
  sampling: 'balanced',
};

const models = {
  nano: new PromptApiEngine({ ...settings, languages: ['en', 'de'] }),
  gemma: new WebLlmEngine('gemma-4-E2B-it-q4f16_1-MLC', settings),
  qwen: new TransformersJsEngine('onnx-community/Qwen3-0.6B-ONNX', {
    ...settings,
    contextWindowSize: 8192, // wins over the shared value
    device: 'wasm',
  }),
};
```

| Setting             | Prompt API             | WebLLM                | transformers.js                                      |
| ------------------- | ---------------------- | --------------------- | ---------------------------------------------------- |
| `contextWindowSize` | – (set by the browser) | `context_window_size` | only the [compaction](../agent/compaction.md) budget |
| `maxOutputTokens`   | – (set by the browser) | `max_tokens`          | `max_new_tokens`, default `1024`                     |
| `sampling`          | `samplingMode`         | `temperature`         | `do_sample`, `temperature`                           |

## Native options

Everything else the engine library has, passed as it is. The settings win over the same option in `native`.

| Engine          | `native`                                       |
| --------------- | ---------------------------------------------- |
| Prompt API      | –                                              |
| WebLLM          | WebLLM's `ChatOptions`, passed to `reload()`   |
| transformers.js | transformers.js generation settings, every run |

```ts
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';

new WebLlmEngine('gemma-4-E2B-it-q4f16_1-MLC', {
  sampling: 'predictable',
  native: { top_p: 0.9, repetition_penalty: 1.05 },
});
```

## Sampling

From always the likeliest word to very varied. WebLLM and transformers.js get the temperature (`SAMPLING_TEMPERATURE`):

| `most-predictable` | `predictable` | `slightly-predictable` | `balanced` | `slightly-creative` | `creative` | `most-creative` |
| ------------------ | ------------- | ---------------------- | ---------- | ------------------- | ---------- | --------------- |
| `0` (greedy)       | `0.2`         | `0.4`                  | `0.7`      | `0.9`               | `1.1`      | `1.3`           |

API: [ModelSettings](../api/browser-models/core.md#modelsettings)
