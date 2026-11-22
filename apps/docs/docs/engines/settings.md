---
title: Settings
---

# Settings

`ModelSettings` mean the same for every engine. Each engine accepts the ones it supports; any other does not compile.

| Setting             | Prompt API      | WebLLM                       | transformers.js                                      |
| ------------------- | --------------- | ---------------------------- | ---------------------------------------------------- |
| `contextWindowSize` | – (the browser) | `context_window_size`        | only the [compaction](../agent/compaction.md) budget |
| `maxOutputTokens`   | – (the browser) | `max_tokens`                 | `max_new_tokens`, default `1024`                     |
| `sampling`          | `samplingMode`  | `temperature`                | `do_sample`, `temperature`                           |
| `native`            | –               | `ChatOptions`, to `reload()` | generation settings, to every run                    |

The settings win over the same option in `native`.

## Sampling

From always the likeliest word to very varied. WebLLM and transformers.js get the temperature (`SAMPLING_TEMPERATURE`):

| `most-predictable` | `predictable` | `slightly-predictable` | `balanced` | `slightly-creative` | `creative` | `most-creative` |
| ------------------ | ------------- | ---------------------- | ---------- | ------------------- | ---------- | --------------- |
| `0` (greedy)       | `0.2`         | `0.4`                  | `0.7`      | `0.9`               | `1.1`      | `1.3`           |

```ts
new WebLlmEngine('gemma-4-E2B-it-q4f16_1-MLC', {
  contextWindowSize: 16384,
  maxOutputTokens: 1024,
  sampling: 'predictable',
  native: { top_p: 0.9, repetition_penalty: 1.05 },
});
```

API: [ModelSettings](../api/browser-models/core.md#modelsettings)
