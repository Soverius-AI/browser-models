---
title: BrowserModelsAgent
---

# BrowserModelsAgent

Layer 2, `@soverius-ai/browser-models-agui`: an AG-UI `AbstractAgent` on the engines. CopilotKit or any AG-UI client works unchanged.

```bash
pnpm add @soverius-ai/browser-models @soverius-ai/browser-models-agui
```

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
<CopilotKitProvider agents__unsafe_dev_only={{ default: agent }}>
  <CopilotChat />
</CopilotKitProvider>
```

Per framework: [Angular](../frameworks/angular.md) · [React](../frameworks/react.md) · [Vue](../frameworks/vue.md). Without CopilotKit: [Without CopilotKit](./without-copilotkit.md).

## Model selection

Explicit. Unknown ids fail the run with `RUN_ERROR`; nothing falls back.

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
