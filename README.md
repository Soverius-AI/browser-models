# browser-models

Run language models in the browser (Chrome/Edge Prompt API, WebLLM, transformers.js) with one engine
interface, and as [AG-UI](https://docs.ag-ui.com) agents. CopilotKit or any AG-UI client works unchanged.

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
| Long conversations | compacted to fit the model's context: older turns become a summary, old tool results are cut |
| Models on a device | explicit model selection, download with progress, list and delete downloaded models          |

## Install

```bash
pnpm add @soverius-ai/browser-models                            # 1 · engines
pnpm add @soverius-ai/browser-models-agui                       # 2 · AG-UI agent
pnpm add @soverius-ai/browser-models-tools                      # 3 · tool calling
pnpm add @mlc-ai/web-llm                                        # only for WebLlmEngine
pnpm add @huggingface/transformers                              # only for TransformersJsEngine
pnpm add @soverius-ai/browser-models-angular                    # or -react, -vue
```

## Usage, layer by layer

Each block is a whole `main.ts`. It runs in Chrome with Gemini Nano, and in CI against a scripted model ([`libs/examples/snippets`](libs/examples/snippets)).

### 1 · Chat on an engine

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

### 2 · An AG-UI agent

```ts title="libs/examples/snippets/src/agent.ts"
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';

// Layer 2: an AG-UI agent on the engine. Any AG-UI client runs it; here its own runAgent.
const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
});
const output = document.body.appendChild(document.createElement('p'));

agent.addMessage({
  id: crypto.randomUUID(),
  role: 'user',
  content: 'Explain AG-UI in one sentence.',
});
await agent.runAgent(
  {},
  { onTextMessageContentEvent: ({ event }) => void output.append(event.delta) },
);
```

### 3 · Tools

```ts title="libs/examples/snippets/src/tools.ts"
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling, type LocalTool } from '@soverius-ai/browser-models-tools';

// Layer 3: tool calling. The agent runs the tool and gives the result back to the model.
const currentTime: LocalTool = {
  name: 'currentTime',
  description: 'Returns the current local time.',
  parameters: { type: 'object', properties: {} },
  execute: async () => new Date().toLocaleTimeString(),
};

const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
  tools: new ToolCalling({ localTools: [currentTime] }),
});
const output = document.body.appendChild(document.createElement('p'));

agent.addMessage({
  id: crypto.randomUUID(),
  role: 'user',
  content: 'What time is it?',
});
await agent.runAgent(
  {},
  {
    onToolCallStartEvent: ({ event }) =>
      void output.append(`[${event.toolCallName}] `),
    onTextMessageContentEvent: ({ event }) => void output.append(event.delta),
  },
);
```

Tool sources: the page's WebMCP tools and remote MCP servers.

```ts
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling } from '@soverius-ai/browser-models-tools';
import { McpTools } from '@soverius-ai/browser-models-tools/mcp';
import { WebMcpTools } from '@soverius-ai/browser-models-tools/webmcp';

new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
  tools: new ToolCalling({
    localTools: [
      new WebMcpTools(), // the page's WebMCP tools
      new McpTools({ url: 'https://example.com/mcp' }), // a remote MCP server
    ],
  }),
});
```

### CopilotKit

```tsx title="libs/examples/snippets/src/copilotkit.tsx"
import {
  CopilotChat,
  CopilotKitProvider,
  useFrontendTool,
} from '@copilotkit/react-core/v2';
import '@copilotkit/react-core/v2/styles.css';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling } from '@soverius-ai/browser-models-tools';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';

// CopilotKit, unmodified: it talks AG-UI, the agent runs the model in the browser.
const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
  tools: new ToolCalling(),
});

// A frontend tool: the model calls it, it runs in the page.
function Background() {
  useFrontendTool(
    {
      name: 'setBackground',
      description: 'Sets the background color of the page.',
      parameters: z.object({ color: z.string() }),
      handler: async ({ color }) => {
        document.body.style.background = color;
        return `The background is ${color}.`;
      },
    },
    [],
  );
  return null;
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <CopilotKitProvider agents__unsafe_dev_only={{ default: agent }}>
    <Background />
    <CopilotChat />
  </CopilotKitProvider>,
);
```

More: [agent](https://browser-models.soverius.ai/docs/agent) ·
[engines](https://browser-models.soverius.ai/docs/engines) ·
[tools](https://browser-models.soverius.ai/docs/tools) ·
[models](https://browser-models.soverius.ai/docs/engines/models) ·
[Angular](https://browser-models.soverius.ai/docs/frameworks/angular) ·
[React](https://browser-models.soverius.ai/docs/frameworks/react) ·
[Vue](https://browser-models.soverius.ai/docs/frameworks/vue) ·
[vanilla](https://browser-models.soverius.ai/docs/agent/without-copilotkit) ·
[how it works](https://browser-models.soverius.ai/docs/architecture) ·
[API reference](https://browser-models.soverius.ai/docs/api/browser-models)

## Packages

| Package                               | Entry             | Exports                                                                                  | You also install                                   |
| ------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `@soverius-ai/browser-models`         | `.`               | `Engine`, `EngineKind`, `ModelSettings`, `Models`, `ModelStore`, `OutputParser`          | –                                                  |
|                                       | `/prompt-api`     | `PromptApiEngine`                                                                        | –                                                  |
|                                       | `/web-llm`        | `WebLlmEngine`                                                                           | `@mlc-ai/web-llm`                                  |
|                                       | `/web-llm/worker` | `startWebLlmWorker`                                                                      | `@mlc-ai/web-llm`                                  |
|                                       | `/transformers`   | `TransformersJsEngine`                                                                   | `@huggingface/transformers`                        |
|                                       | `/engines`        | `Engines.create(kind, …)` and all three engines                                          | both engine libraries                              |
| `@soverius-ai/browser-models-agui`    | `.`               | `BrowserModelsAgent`, `AgentRun`, `SummaryCompaction`, `AgentEvents`, `MODEL_ACTIVITY` … | peers `@ag-ui/client`, `@ag-ui/core` 1.x, `rxjs` 7 |
| `@soverius-ai/browser-models-tools`   | `.`               | `ToolCalling`, `LocalTool`, `LocalToolSource`, `ToolCallRepair`                          | peers `@ag-ui/client` 1.x, `rxjs` 7                |
|                                       | `/mcp`            | `McpTools`                                                                               | –                                                  |
|                                       | `/webmcp`         | `WebMcpTools`                                                                            | –                                                  |
|                                       | `/copilotkit`     | `OpenGenerativeUi`                                                                       | –                                                  |
| `@soverius-ai/browser-models-angular` | `.`               | `provideBrowserModels`, `withAgent`, `withDevtools`, `injectBrowserModels`               | `@angular/core`                                    |
| `@soverius-ai/browser-models-react`   | `.`               | `useModelStore`, `useDevtools`                                                           | `react`                                            |
| `@soverius-ai/browser-models-vue`     | `.`               | `useModelStore`, `useDevtools`                                                           | `vue`                                              |

The engine core has no runtime dependencies; WebLLM runs in the package's own Web Worker. `@ag-ui/client`, `@ag-ui/core` (1.x) and `rxjs` are peers: the app's copy, usually CopilotKit's; with npm, install `@ag-ui/client` at the version CopilotKit pins. `jsonrepair` and `@cfworker/json-schema` come with `-tools`. No zod.

| You build                            | Install                                        |
| ------------------------------------ | ---------------------------------------------- |
| a plain chat, no AG-UI               | `browser-models`                               |
| an AG-UI or CopilotKit chat          | `browser-models` + `browser-models-agui`       |
| the same with tools, MCP, WebMCP, UI | add `browser-models-tools`                     |
| Angular, React or Vue bindings       | add `browser-models-angular`, `-react`, `-vue` |

## Examples

Try them in the [playground](https://browser-models.soverius.ai/playground), or run them locally:

```bash
pnpm install
pnpm start:react      # http://localhost:4201
pnpm start:examples   # all examples at once
pnpm start:docs       # docs site with the playground, http://localhost:4400
```

| Script            | App                       | Port |
| ----------------- | ------------------------- | ---- |
| `start:docs`      | `apps/docs`               | 4400 |
| `start:angular`   | `apps/angular-copilotkit` | 4200 |
| `start:react`     | `apps/react-copilotkit`   | 4201 |
| `start:vue`       | `apps/vue-copilotkit`     | 4202 |
| `start:vanilla`   | `apps/vanilla-agui`       | 4203 |
| `start:engine`    | `apps/engine-chat`        | 4204 |
| `start:agent`     | `apps/agent-chat`         | 4205 |
| `start:assistant` | `apps/docs-assistant`     | 4206 |

| App                       | Port | Stack                                        | Shows                                                                                               |
| ------------------------- | ---- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/angular-copilotkit` | 4200 | Angular 22, `@copilotkit/angular` 0.6        | CopilotKit docs examples (`show_incident`, `getWeather`, `change_background`), streaming `planTrip` |
| `apps/react-copilotkit`   | 4201 | React 19, `@copilotkit/react-core` 1.88      | CopilotKit docs examples (`addTodo`, `getWeather`), streaming `planTrip`                            |
| `apps/vue-copilotkit`     | 4202 | Vue 3, `@copilotkit/vue` 1.88                | CopilotKit docs examples (`addTodo`, `getWeather`), streaming `planTrip`                            |
| `apps/vanilla-agui`       | 4203 | plain `@ag-ui/client`, no CopilotKit         | `runAgent` loop with a frontend tool, a demo MCP server at `/mcp`, Context7 MCP with an API key     |
| `apps/agent-chat`         | 4205 | `-agui` without tools, plain `@ag-ui/client` | the agent alone: thinking, model loading and compaction events, stop                                |
| `apps/engine-chat`        | 4204 | only `@soverius-ai/browser-models`, no AG-UI | the engine alone: Prompt API check, model picker, streamed parts with token counts, stop            |
| `apps/docs-assistant`     | 4206 | React 19, CopilotKit, all three layers       | these docs, asked by a model in your browser: search tool, page cards; "Ask the docs" on the site   |

One example per layer: `engine-chat` (engines), `agent-chat` (plus the AG-UI agent), the others (plus tool calling). All examples share:

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

| Folder                            | Content                                            |
| --------------------------------- | -------------------------------------------------- |
| `libs/agent/browser-models`       | `@soverius-ai/browser-models`: engines             |
| `libs/agent/browser-models-agui`  | `@soverius-ai/browser-models-agui`: AG-UI agent    |
| `libs/agent/browser-models-tools` | `@soverius-ai/browser-models-tools`: tool calling  |
| `libs/frameworks/*`               | `@soverius-ai/browser-models-angular\|react\|vue`  |
| `libs/examples/shared`            | private: demo engine, model list, tools            |
| `apps/*`                          | the examples, their Playwright e2e tests, the docs |

```bash
pnpm install
pnpm exec playwright install chromium
pnpm nx run-many -t lint test typecheck build
pnpm nx run-many -t e2e
pnpm start:docs   # docs site with the playground, port 4400
```

| Tag           | What it starts                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `v0.1.0`      | publishes the six packages to npm, and a GitHub release; must match the version in the package.json files |
| `docs-<name>` | rebuilds the docs site and playground from the tip of `main`                                              |

Cut a release: `pnpm nx release version 0.2.0`, commit, then tag `v0.2.0` and push both.
