---
slug: /
title: Overview
---

# browser-models

Use the Prompt API, WebLLM, or ONNX through transformers.js with one consistent API. Server-model fallback is planned for devices where local inference isn’t available.

The agent exposes [AG-UI](https://docs.ag-ui.com) events, so you can connect it to CopilotKit or another AG-UI client.

| Engine          | Class                  | Runs on                                 | Model storage              |
| --------------- | ---------------------- | --------------------------------------- | -------------------------- |
| Prompt API      | `PromptApiEngine`      | Chrome (Gemini Nano), Edge (Phi-4-mini) | the browser                |
| WebLLM          | `WebLlmEngine`         | WebGPU                                  | Cache API (default) · OPFS |
| transformers.js | `TransformersJsEngine` | WebGPU or WASM                          | Cache API (default) · OPFS |

## Packages

| Package                               | Entry             | Exports                                                                    | You also install            |
| ------------------------------------- | ----------------- | -------------------------------------------------------------------------- | --------------------------- |
| `@soverius-ai/browser-models`         | `.`               | `Engine`, `LocalTool`, `LocalToolSource`, `AgentRun`, `MODEL_ACTIVITY` …   | –                           |
|                                       | `/agent`          | `BrowserModelsAgent`, `ModelStore`                                         | –                           |
|                                       | `/prompt-api`     | `PromptApiEngine`                                                          | –                           |
|                                       | `/web-llm`        | `WebLlmEngine`                                                             | `@mlc-ai/web-llm`           |
|                                       | `/web-llm/worker` | `startWebLlmWorker`                                                        | `@mlc-ai/web-llm`           |
|                                       | `/transformers`   | `TransformersJsEngine`                                                     | `@huggingface/transformers` |
|                                       | `/webmcp`         | `WebMcpTools`                                                              | –                           |
|                                       | `/mcp`            | `McpTools`                                                                 | –                           |
|                                       | `/copilotkit`     | `OpenGenerativeUi`                                                         | –                           |
| `@soverius-ai/browser-models-angular` | `.`               | `provideBrowserModels`, `withAgent`, `withDevtools`, `injectBrowserModels` | `@angular/core`             |
| `@soverius-ai/browser-models-react`   | `.`               | `useModelStore`, `useDevtools`                                             | `react`                     |
| `@soverius-ai/browser-models-vue`     | `.`               | `useModelStore`, `useDevtools`                                             | `vue`                       |

`@ag-ui/core`, `@ag-ui/client` and `rxjs` come with `@soverius-ai/browser-models`.

The framework packages build on `/agent`, so they need its peer dependencies too.

## Install

```bash
pnpm add @soverius-ai/browser-models
pnpm add @mlc-ai/web-llm                      # only for WebLlmEngine
pnpm add @huggingface/transformers            # only for TransformersJsEngine
pnpm add @soverius-ai/browser-models-angular  # or @soverius-ai/browser-models-react, @soverius-ai/browser-models-vue
```

## Minimal agent

```ts
import { BrowserModelsAgent } from '@soverius-ai/browser-models/agent';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
});
```

Next: [Agent](./agent.md) · [Engines](./engines.md) · [Tools](./tools.md) · [Playground](/playground)
