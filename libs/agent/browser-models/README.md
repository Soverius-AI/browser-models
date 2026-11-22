# @soverius-ai/browser-models

Run language models in the browser with one engine interface: the Chrome/Edge Prompt API, WebLLM and transformers.js. No AG-UI, no dependencies.

```bash
pnpm add @soverius-ai/browser-models
pnpm add @mlc-ai/web-llm            # only for WebLlmEngine
pnpm add @huggingface/transformers  # only for TransformersJsEngine
```

```ts
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

const engine = new PromptApiEngine({ sampling: 'balanced' });
if ((await engine.availability()) !== 'unavailable') {
  await engine.load();
  for await (const part of engine.generate({
    messages: [{ role: 'user', content: 'Hi' }],
  }))
    if (part.type === 'text') output.textContent += part.text;
}
```

Entries: `.`, `/prompt-api`, `/web-llm`, `/web-llm/worker`, `/transformers`, `/engines` (all three, by `EngineKind`).

| Package                                                 | For                                             |
| ------------------------------------------------------- | ----------------------------------------------- |
| `@soverius-ai/browser-models-agui`                      | AG-UI agent, for CopilotKit or any AG-UI client |
| `@soverius-ai/browser-models-tools`                     | tool calling, MCP, WebMCP, generative UI        |
| `@soverius-ai/browser-models-angular`, `-react`, `-vue` | framework bindings                              |

[Docs](https://browser-models.soverius.ai/docs) · [Playground](https://browser-models.soverius.ai/playground) · by [Soverius AI](https://soverius.ai) · MIT
