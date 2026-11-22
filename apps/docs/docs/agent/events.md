---
title: Events
---

# Events

| Source           | AG-UI events                                                                      |
| ---------------- | --------------------------------------------------------------------------------- |
| run              | `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR` (`code: 'abort'` when stopped)         |
| text             | `TEXT_MESSAGE_START`, `_CONTENT`, `_END`                                          |
| `<think>` blocks | `REASONING_START`, `REASONING_MESSAGE_START`, `_CONTENT`, `_END`, `REASONING_END` |
| model loading    | `ACTIVITY_SNAPSHOT` `soverius.model` `{ engineId, status, progress }`             |
| tool calls       | `TOOL_CALL_START`, `_ARGS`, `_END`, `TOOL_CALL_RESULT` (tools of the agent)       |
| repairs          | `CUSTOM` `soverius.tool_repair` `{ toolCallId, raw, steps }`                      |
| corrections      | `MESSAGES_SNAPSHOT`, see below                                                    |
| tool sources     | `CUSTOM` `soverius.tool_source_error` `{ message }`                               |
| compaction       | `CUSTOM` `soverius.compaction`, see [Compaction](./compaction.md#event)           |

Tool call events need `tools`: [Tool calls](../architecture/tool-calls.md).

## Order

| Step            | Events                                                 |
| --------------- | ------------------------------------------------------ |
| start           | `RUN_STARTED`                                          |
| `tools.start()` | `soverius.tool_source_error` per failing tool source   |
| `engine.load()` | `ACTIVITY_SNAPSHOT` while it loads                     |
| per model call  | `soverius.compaction`, then text, thinking, tool calls |
| end             | `RUN_FINISHED` or `RUN_ERROR`                          |

## MESSAGES_SNAPSHOT

The run's input messages plus what the run produced. AG-UI has no other way to change or take back a streamed tool call.

| When                                                 | Snapshot               |
| ---------------------------------------------------- | ---------------------- |
| repair changed the name of a streamed call           | the repaired call      |
| repaired arguments do not continue what was streamed | the repaired call      |
| a streamed call cannot be repaired, or was cut off   | without the call       |
| error or abort while a streamed call is open         | without the open calls |

## AgentEvents

Reads the agent's own events, typed; `undefined` for every other event.

```ts
import { AgentEvents } from '@soverius-ai/browser-models-agui';

agent.subscribe({
  onEvent: ({ event }) => {
    AgentEvents.modelActivity(event); // { engineId, status: 'loading' | 'ready', progress } | undefined
    AgentEvents.compaction(event); // CompactionStatus | undefined
    AgentEvents.toolRepair(event); // { toolCallId, raw, steps } | undefined
    AgentEvents.toolSourceError(event); // { message } | undefined
  },
});
```

## Model loading

Every run calls `engine.load()` before the first model call (after `tools.start()`). While the engine reports progress, the run sends `ACTIVITY_SNAPSHOT` events, one per whole percent; already loaded: none. In CopilotKit, render them as an activity message:

```ts
import { MODEL_ACTIVITY } from '@soverius-ai/browser-models-agui'; // 'soverius.model'
import * as z from 'zod';

const modelActivity = z.object({
  engineId: z.string(),
  status: z.enum(['loading', 'ready']),
  progress: z.number(), // 0–1
});
```

Per framework: [Angular](../frameworks/angular.md#model-loading-in-the-chat) · [React](../frameworks/react.md#model-loading-in-the-chat) · [Vue](../frameworks/vue.md#model-loading-in-the-chat)
