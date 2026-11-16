---
title: Agent
---

# Agent

```ts
import { BrowserModelsAgent } from '@soverius-ai/browser-models/agent';
```

| Option         | Type                                       | Default                                        |
| -------------- | ------------------------------------------ | ---------------------------------------------- |
| `models`       | `Record<string, Engine>`                   | required                                       |
| `defaultModel` | key of `models`                            | required                                       |
| `agentId`      | `string`                                   | –                                              |
| `description`  | `string`                                   | `'An agent running on a model in the browser'` |
| `localTools`   | `(LocalTool \| LocalToolSource)[]`         | `[]`                                           |
| `maxSteps`     | `number` (model calls per run)             | `5`                                            |
| `repairHook`   | see [Tools → Repair](./tools.md#repair)    | –                                              |
| `compaction`   | [`Compaction`](./compaction.md) or `false` | `new SummaryCompaction()`                      |

## Model selection

No automatic fallback. Unknown ids fail the run with `RUN_ERROR`.

```ts
agent.selectModel('qwen'); // all following runs, also on clones
agent.selectedModel; // 'qwen'
agent.modelIds; // ['nano', 'qwen']
agent.engine('qwen'); // the Engine

// per run
agent.runAgent({ forwardedProps: { soverius: { model: 'nano' } } });
```

## Events

| Source           | AG-UI events                                                                      |
| ---------------- | --------------------------------------------------------------------------------- |
| run              | `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`                                        |
| text             | `TEXT_MESSAGE_START`, `_CONTENT`, `_END`                                          |
| `<think>` blocks | `REASONING_START`, `REASONING_MESSAGE_START`, `_CONTENT`, `_END`, `REASONING_END` |
| tool calls       | `TOOL_CALL_START`, `_ARGS`, `_END`, `TOOL_CALL_RESULT` (local tools)              |
| repairs          | `CUSTOM` `soverius.tool_repair` `{ toolCallId, raw, steps }`                      |
| corrections      | `MESSAGES_SNAPSHOT` when repair changed streamed arguments                        |
| tool sources     | `CUSTOM` `soverius.tool_source_error` `{ message }`                               |
| compaction       | `CUSTOM` `soverius.compaction`, see [Compaction](./compaction.md#event)           |
| model loading    | `ACTIVITY_SNAPSHOT` `soverius.model`, see [Model loading](#model-loading)         |
| stopped          | `RUN_ERROR` with `code: 'abort'` (`agent.abortRun()`)                             |

Tool calls stream while the model writes them, see [Tools](./tools.md#streaming).

## Model loading

Every run calls `engine.load()` first. While the engine reports progress, the run emits
`ACTIVITY_SNAPSHOT` events (one per whole percent). Already loaded: no events.

```ts
import { MODEL_ACTIVITY } from '@soverius-ai/browser-models'; // 'soverius.model'
import { z } from 'zod';

// event.content; progress is 0–1
const modelActivity = z.object({
  engineId: z.string(),
  status: z.enum(['loading', 'ready']),
  progress: z.number(),
});
```

## Devtools

```ts
const stop = agent.connectDevtools();
// window.postMessage({ source: 'soverius-ai/devtools', agentId, event }, '/')
```

No-op without `window` (SSR). `agentId` is `'default'` when the agent has none.

Call `stop()` to switch it off again. The [Playground](/playground) has a "Devtools" switch that lists these events; the examples switch them on in dev mode and with `?devtools`.

| Framework | Devtools                       |
| --------- | ------------------------------ |
| Angular   | `withDevtools()`               |
| React     | `useDevtools(agent, enabled?)` |
| Vue       | `useDevtools(agent, enabled?)` |
