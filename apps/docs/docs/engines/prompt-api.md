---
title: Prompt API
---

# Prompt API

The model built into the browser: Gemini Nano in Chrome, Phi-4-mini in Edge (behind `edge://flags/#edge-llm-prompt-api-for-phi-mini`).

```ts
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

new PromptApiEngine({ languages: ['en', 'de'], sampling: 'balanced' });
```

| Option          | Default                | Purpose                                                  |
| --------------- | ---------------------- | -------------------------------------------------------- |
| `languages`     | `['en']`               | input and output languages; `availability()` checks them |
| `sampling`      | the browser's default  | `samplingMode`, see [Settings](./settings.md)            |
| `languageModel` | global `LanguageModel` | another implementation, for tests                        |

| Behaviour             |                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| download              | by the browser; `load()` needs a user gesture; progress through `onProgress`                      |
| storage               | the browser's; no `delete()`                                                                      |
| context size          | the browser's; `contextWindowSize` is known after the first answer                                |
| reply length          | the browser's; no `maxOutputTokens`                                                               |
| sessions              | one per conversation, reused while the history matches                                            |
| token counts          | `usage.totalTokens` from `session.contextUsage`                                                   |
| context full          | the browser drops the oldest turns; a single prompt that is too long fails (`QuotaExceededError`) |
| `temperature`, `topK` | only in browser extensions; web pages get `sampling`                                              |

API: [prompt-api](../api/browser-models/prompt-api.md)
