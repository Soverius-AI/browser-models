---
title: Engines
---

# Engines

Layer 1, `@soverius-ai/browser-models`. No AG-UI, no engine library needed until you use that engine. An engine runs one model: `availability()`, `load()`, `generate()`.

```bash
pnpm add @soverius-ai/browser-models
```

## A first chat

```ts title="libs/examples/snippets/src/chat.ts"
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

// Layer 1: an engine. The model built into the browser: Gemini Nano in Chrome.
const engine = new PromptApiEngine();
const output = document.body.appendChild(document.createElement('p'));

if ((await engine.availability()) === 'unavailable') {
  output.textContent = 'This browser has no Prompt API.';
} else {
  for await (const part of engine.generate({
    messages: [{ role: 'user', content: 'Write a haiku about the browser.' }],
  }))
    if (part.type === 'text') output.append(part.text);
}
```

`generate()` streams parts: `text`, then one `finish` with the reason and the token counts. Engines keep no history: send the whole conversation every time. More: [Streaming](./streaming.md).

## The engines

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

## Bundle cost per entry

| Import                                      | App JS (gzip) | Built, downloaded on load                                         | Needs installed             |
| ------------------------------------------- | ------------- | ----------------------------------------------------------------- | --------------------------- |
| `PromptApiEngine` from `/prompt-api`        | 1.4 KB        | none                                                              | none                        |
| `TransformersJsEngine` from `/transformers` | 3.1 KB        | transformers.js 160 KB, ONNX Runtime wasm 6.4 MB                  | `@huggingface/transformers` |
| `WebLlmEngine` from `/web-llm`              | 2.4 KB        | WebLLM worker 2.1 MB (in-page WebLLM 2.1 MB with `worker: false`) | `@mlc-ai/web-llm`           |
| `Engines.create` from `/engines`            | 4.6 KB        | all of the above                                                  | both                        |
| `PromptApiEngine` from `/engines`           | 1.4 KB        | none, but the ONNX wasm (6.4 MB) lands in `dist`                  | both                        |

Vite 8 app build, minified, all sizes gzip. One engine: import it from its own entry. `/engines`: only when the kind is picked at run time.

## All engines by kind

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
