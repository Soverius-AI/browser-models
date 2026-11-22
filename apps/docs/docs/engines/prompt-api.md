---
title: Prompt API
---

# Prompt API

The model built into the browser: Gemini Nano in Chrome, Phi-4-mini in Edge (behind `edge://flags/#edge-llm-prompt-api-for-phi-mini`).

```ts
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

new PromptApiEngine({ languages: ['en', 'de'], sampling: 'balanced' });
```

| Option                                 | Default                | Purpose                                                                                    |
| -------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| `languages`                            | `['en']`               | input and output languages; `availability()` checks them                                   |
| `sampling`                             | the browser's default  | `samplingMode`, see [Settings](./settings.md)                                              |
| `contextWindowSize`, `maxOutputTokens` | –                      | accepted, so one [settings](./settings.md) object fits every engine; the browser sets both |
| `languageModel`                        | global `LanguageModel` | another implementation, for tests                                                          |

| Behaviour             |                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| download              | by the browser; `load()` needs a user gesture; progress through `onProgress`                                                                                            |
| storage               | the browser's; no `delete()`                                                                                                                                            |
| context size          | the browser's; `contextWindowSize` is known after the first answer                                                                                                      |
| reply length          | the browser's; no `maxOutputTokens`                                                                                                                                     |
| sessions              | the last one is kept and reused when the next request is the same history plus a new user message; anything else (another thread, a compacted prompt) creates a new one |
| last message          | must be from the user, else `generate()` throws                                                                                                                         |
| token counts          | `usage.totalTokens` from `session.contextUsage`                                                                                                                         |
| context full          | the browser drops the oldest turns; a single prompt that is too long fails (`QuotaExceededError`)                                                                       |
| `temperature`, `topK` | only in browser extensions; web pages get `sampling`                                                                                                                    |

API: [prompt-api](../api/browser-models/prompt-api.md)
