---
title: Choose an engine
---

# Choose an engine

Layer 1, `@soverius-ai/browser-models`. No AG-UI, no dependencies.

```bash
pnpm add @soverius-ai/browser-models
```

| Class                  | Entry           | `kind`                      | `id`                      | JSON output (`supportsConstraint`) | `delete()` |
| ---------------------- | --------------- | --------------------------- | ------------------------- | ---------------------------------- | ---------- |
| `PromptApiEngine`      | `/prompt-api`   | `EngineKind.PromptApi`      | `prompt-api`              | yes (`responseConstraint`)         | no         |
| `WebLlmEngine`         | `/web-llm`      | `EngineKind.WebLlm`         | `web-llm:<model id>`      | yes (`response_format`)            | yes        |
| `TransformersJsEngine` | `/transformers` | `EngineKind.TransformersJs` | `transformers:<model id>` | no                                 | yes        |

Import each engine from its own entry: then only its library has to be installed. WebLLM and transformers.js are imported on first use, so they are not in the initial bundle.

## Is the Prompt API there?

`availability()` asks the engine, downloads nothing, needs no user gesture. The app picks; nothing falls back by itself.

```ts
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';

const nano = new PromptApiEngine({ languages: ['en'] });
const engine =
  (await nano.availability()) === 'unavailable'
    ? new WebLlmEngine('gemma-4-E2B-it-q4f16_1-MLC', {
        contextWindowSize: 16384,
      })
    : nano;
```

| `availability()` | Meaning                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `available`      | ready to run                                                         |
| `downloadable`   | `load()` downloads first; the Prompt API needs a user gesture for it |
| `downloading`    | a download runs                                                      |
| `unavailable`    | not in this browser, on this device, or for these languages          |

## All engines by kind

For apps that install both engine libraries:

```ts
import {
  EngineKind,
  Engines,
  type BrowserEngine,
} from '@soverius-ai/browser-models/engines';

const gemma = Engines.create(EngineKind.WebLlm, 'gemma-4-E2B-it-q4f16_1-MLC', {
  contextWindowSize: 16384,
});
const nano = Engines.create(EngineKind.PromptApi, { sampling: 'balanced' });

function label(engine: BrowserEngine): string {
  switch (engine.kind) {
    case EngineKind.PromptApi:
      return 'built into the browser'; // engine is a PromptApiEngine here
    default:
      return engine.id;
  }
}
```

Next: [Prompt API](./prompt-api.md) · [WebLLM](./web-llm.md) · [transformers.js](./transformers.md) · [Settings](./settings.md) · [Streaming](./streaming.md)
