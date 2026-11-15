# browser-models

Run language models in the browser (Chrome/Edge Prompt API, WebLLM, transformers.js) as
[AG-UI](https://docs.ag-ui.com) agents. CopilotKit or any AG-UI client works unchanged.

[Docs](https://browser-models.soverius.ai/docs) · [Playground](https://browser-models.soverius.ai/playground) · by [Soverius AI](https://soverius.ai) · [Newsletter](https://soverius.ai/newsletter) · MIT

> Early stage. Working: the agent runtime, three engines (Prompt API, WebLLM, transformers.js), WebMCP and
> MCP tool sources, and the Angular, React and Vue packages.

|                    |                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Engines            | Gemini Nano / Phi-4-mini (Prompt API), WebLLM (WebGPU), transformers.js (WebGPU, WASM)       |
| Protocol           | AG-UI events: text, reasoning, tool calls, activity (model loading), no server               |
| Tool calls         | arguments stream while the model writes; broken calls are repaired before they run           |
| Generative UI      | components you write, or pages the model writes (CopilotKit's Open Generative UI, sandboxed) |
| Tools              | local tools, frontend tools (e.g. CopilotKit), the page's WebMCP tools, MCP servers          |
| Models on a device | explicit model selection, download with progress, list and delete downloaded models          |

## Install

```bash
pnpm add @soverius-ai/browser-models
pnpm add @mlc-ai/web-llm                      # only for WebLlmEngine
pnpm add @huggingface/transformers            # only for TransformersJsEngine
pnpm add @soverius-ai/browser-models-angular  # or @soverius-ai/browser-models-react, @soverius-ai/browser-models-vue
```

## Usage

```ts
import {
  BrowserModelsAgent,
  ModelStore,
} from '@soverius-ai/browser-models/agent';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';

export const agent = new BrowserModelsAgent({
  models: {
    nano: new PromptApiEngine(),
    qwen: new WebLlmEngine('Qwen3-0.6B-q4f16_1-MLC'),
  },
  defaultModel: 'nano',
});

// Availability, download progress and the downloaded models, for your UI.
export const models = new ModelStore(agent);
```

The agent is an AG-UI `AbstractAgent`. Hand it to CopilotKit:

```tsx
import { CopilotChat, CopilotKitProvider } from '@copilotkit/react-core/v2';
import { agent } from './agent';

export function App() {
  return (
    <CopilotKitProvider agents__unsafe_dev_only={{ default: agent }}>
      <CopilotChat />
    </CopilotKitProvider>
  );
}
```

Or run it with the plain AG-UI client:

```ts
agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: 'Hello' });
await agent.runAgent(
  {},
  { onTextMessageContentEvent: ({ event }) => console.log(event.delta) },
);
```

### Tools

```ts
import type { LocalTool } from '@soverius-ai/browser-models';
import { McpTools } from '@soverius-ai/browser-models/mcp';
import { WebMcpTools } from '@soverius-ai/browser-models/webmcp';

const currentTime: LocalTool = {
  name: 'currentTime',
  description: 'Returns the current local time.',
  parameters: { type: 'object', properties: {} },
  execute: async () => new Date().toLocaleTimeString(),
};

new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
  localTools: [
    currentTime, // runs in the agent
    new WebMcpTools(), // the page's WebMCP tools
    new McpTools({ url: 'https://example.com/mcp' }), // a remote MCP server
  ],
});
```

Frontend tools (for example CopilotKit's `useFrontendTool`) need no setup: the agent emits the call and the
client runs it.

More: [agent](https://browser-models.soverius.ai/docs/agent) ·
[engines](https://browser-models.soverius.ai/docs/engines) ·
[tools](https://browser-models.soverius.ai/docs/tools) ·
[models](https://browser-models.soverius.ai/docs/models) ·
[Angular](https://browser-models.soverius.ai/docs/angular) ·
[React](https://browser-models.soverius.ai/docs/react) ·
[Vue](https://browser-models.soverius.ai/docs/vue) ·
[vanilla](https://browser-models.soverius.ai/docs/vanilla)

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

## Examples

Try them in the [playground](https://browser-models.soverius.ai/playground), or run them locally:

```bash
pnpm install
pnpm nx run react-copilotkit:serve   # http://localhost:4201
```

| App                       | Port | Stack                                   | Shows                                                                                               |
| ------------------------- | ---- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/angular-copilotkit` | 4200 | Angular 22, `@copilotkit/angular` 0.6   | CopilotKit docs examples (`show_incident`, `getWeather`, `change_background`), streaming `planTrip` |
| `apps/react-copilotkit`   | 4201 | React 19, `@copilotkit/react-core` 1.88 | CopilotKit docs examples (`addTodo`, `getWeather`), streaming `planTrip`                            |
| `apps/vue-copilotkit`     | 4202 | Vue 3, `@copilotkit/vue` 1.88           | CopilotKit docs examples (`addTodo`, `getWeather`), streaming `planTrip`                            |
| `apps/vanilla-agui`       | 4203 | plain `@ag-ui/client`, no CopilotKit    | `runAgent` loop with a frontend tool, a demo MCP server at `/mcp`, Context7 MCP with an API key     |

All examples share:

- a model picker: Gemini Nano, Qwen3 and Gemma 4 on WebLLM and transformers.js;
- `?model=demo`: a scripted engine that needs no download (used by the e2e tests and the playground);
- the local tool `currentTime` and the WebMCP page tool `pageTitle`;
- a model loading card in the chat, from the agent's activity events.

The CopilotKit examples also have a "Models on this device" panel that lists and deletes downloads.

| Try                              | What happens                                                             |
| -------------------------------- | ------------------------------------------------------------------------ |
| `What time is it?`               | local tool                                                               |
| `What is the page title?`        | WebMCP page tool                                                         |
| `What is the weather in Vienna?` | generative UI: a card rendered from a tool call                          |
| `Draw a chart with Chart.js`     | Open Generative UI: the model writes a page, shown in a sandboxed iframe |
| `Plan a trip to Vienna`          | a card that fills in while the tool arguments stream                     |
| `docs for react` (vanilla)       | two calls to the Context7 MCP server, after you switch it on             |

## Development

Nx monorepo, TypeScript and ESM throughout.

| Folder                      | Content                                            |
| --------------------------- | -------------------------------------------------- |
| `libs/agent/browser-models` | `@soverius-ai/browser-models`                      |
| `libs/frameworks/*`         | `@soverius-ai/browser-models-angular\|react\|vue`  |
| `libs/examples/shared`      | private: demo engine, model list, tools            |
| `apps/*`                    | the examples, their Playwright e2e tests, the docs |

```bash
pnpm install
pnpm exec playwright install chromium
pnpm nx run-many -t lint test typecheck build
pnpm nx run-many -t e2e
pnpm nx run docs:serve   # docs site with the playground, port 4400
```

| Tag           | What it starts                                                           |
| ------------- | ------------------------------------------------------------------------ |
| `v0.1.0`      | publishes the four packages to npm as that version, and a GitHub release |
| `docs-<name>` | rebuilds the docs site and playground from the tip of `main`             |
