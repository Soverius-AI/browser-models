---
title: BrowserModelsAgent
---

# BrowserModelsAgent

Layer 2, `@soverius-ai/browser-models-agui`: an AG-UI `AbstractAgent` on the engines. CopilotKit or any AG-UI client works unchanged.

```bash
pnpm add @soverius-ai/browser-models @soverius-ai/browser-models-agui
pnpm add @ag-ui/client zod   # only without CopilotKit
```

| Peer            | Range    | Comes from                                                         |
| --------------- | -------- | ------------------------------------------------------------------ |
| `@ag-ui/client` | `^1.0.0` | CopilotKit, or install it                                          |
| `@ag-ui/core`   | `^1.0.0` | `@ag-ui/client`                                                    |
| `rxjs`          | `^7.8.0` | `@ag-ui/client`; do not install it yourself                        |
| `zod`           | –        | needed by `@ag-ui/core`, not by this package; CopilotKit brings it |

- Without zod, `@ag-ui/core` fails the build: `"z" is not exported by … zod/v4`.
- An `rxjs` of your own can be a second copy next to the one `@ag-ui/client` pins.

The agent has to use the same `@ag-ui/client` as the client, or TypeScript rejects it as an `AbstractAgent`. pnpm and npm install peers by themselves; pnpm reuses CopilotKit's copy, npm installs the newest 1.x next to CopilotKit's. With npm, install the version CopilotKit pins:

```bash
npm view @copilotkit/react-core dependencies    # "@ag-ui/client": "1.0.2"
npm install @ag-ui/client@1.0.2
npm ls @ag-ui/client                           # one version
```

## A first agent

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

The agent keeps the conversation (`agent.messages`) and streams AG-UI events: `RUN_STARTED`, `TEXT_MESSAGE_*`, `RUN_FINISHED`. More: [Events](./events.md).

## Options

```ts
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';

const agent = new BrowserModelsAgent({
  models: {
    nano: new PromptApiEngine(),
    gemma: new WebLlmEngine('gemma-4-E2B-it-q4f16_1-MLC', {
      contextWindowSize: 16384,
    }),
  },
  defaultModel: 'gemma',
});
```

| Option         | Type                                                   | Default                                        |
| -------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `models`       | `Record<string, Engine>`                               | required                                       |
| `defaultModel` | key of `models`                                        | required                                       |
| `tools`        | [`Tools`](../tools/index.md), e.g. `new ToolCalling()` | none: chat only                                |
| `compaction`   | [`Compaction`](./compaction.md) or `false`             | `new SummaryCompaction()`                      |
| `agentId`      | `string`                                               | –                                              |
| `description`  | `string`                                               | `'An agent running on a model in the browser'` |

Without `tools` the agent only chats: one model call per run, the client's tools are not offered to the model.

## With CopilotKit

```tsx
import { CopilotChat, CopilotKitProvider } from '@copilotkit/react-core/v2';

export const App = () => (
  <CopilotKitProvider agents__unsafe_dev_only={{ default: agent }}>
    <CopilotChat />
  </CopilotKitProvider>
);
```

Per framework: [Angular](../frameworks/angular.md) · [React](../frameworks/react.md) · [Vue](../frameworks/vue.md). Without CopilotKit: [Without CopilotKit](./without-copilotkit.md).

## Model selection

Explicit; nothing falls back.

| Unknown id                                     | Result                                          |
| ---------------------------------------------- | ----------------------------------------------- |
| `agent.selectModel('x')`                       | throws `Unknown model "x".`                     |
| `forwardedProps: { soverius: { model: 'x' } }` | the run fails: `RUN_ERROR` `Unknown model "x".` |

```ts
agent.selectModel('nano'); // all following runs, also on the clones a client makes
agent.selectedModel; // 'nano'
agent.modelIds; // ['nano', 'gemma']
agent.engine('gemma'); // the WebLlmEngine, typed

// one run only
agent.runAgent({ forwardedProps: { soverius: { model: 'gemma' } } });
```

## Stop

```ts
agent.abortRun(); // the run ends with RUN_ERROR, code 'abort'
```

Example: `apps/agent-chat` ([Playground](/playground?platform=agent)). API: [browser-models-agui](../api/browser-models-agui/index.md)
