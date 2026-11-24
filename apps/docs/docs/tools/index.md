---
title: Tools
---

# Tools

Layer 2, `@soverius-ai/browser-models-tools`. Tool calling on an engine: `ToolCallingAgent`, no AG-UI. The AG-UI agent (layer 3) gets the same tool calling through `ToolCalling`.

| Class              | Tool calling for                                             | Yields           |
| ------------------ | ------------------------------------------------------------ | ---------------- |
| `ToolCallingAgent` | an engine, [no AG-UI](#toolcallingagent)                     | parts of `run()` |
| `ToolCalling`      | [`BrowserModelsAgent`](#in-the-ag-ui-agent) (`tools` option) | AG-UI events     |

```bash
pnpm add @soverius-ai/browser-models @soverius-ai/browser-models-tools
```

## ToolCallingAgent

```ts title="libs/examples/snippets/src/engine-tools.ts"
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import {
  ToolCallingAgent,
  type LocalTool,
} from '@soverius-ai/browser-models-tools';

// Layer 2: tool calling on the engine, no AG-UI. ToolCallingAgent runs the tool and keeps the chat.
const currentTime: LocalTool = {
  name: 'currentTime',
  description: 'Returns the current local time.',
  parameters: { type: 'object', properties: {} },
  execute: async () => new Date().toLocaleTimeString(),
};

const agent = new ToolCallingAgent({
  engine: new PromptApiEngine(),
  localTools: [currentTime],
});
const output = document.body.appendChild(document.createElement('p'));

for await (const part of agent.run('What time is it?')) {
  if (part.type === 'tool-call') output.append(`[${part.call.name}] `);
  if (part.type === 'text') output.append(part.text);
}
```

|                 | `BrowserModelsAgent` + `ToolCalling`     | `ToolCallingAgent`                                   |
| --------------- | ---------------------------------------- | ---------------------------------------------------- |
| Protocol        | AG-UI events                             | parts of `run()`                                     |
| Conversation    | the client's messages                    | `agent.messages`, kept across runs                   |
| Tools elsewhere | the client's (`RunAgentInput.tools`)     | `tools`: the caller runs them                        |
| Stop            | `abortRun()` → `RUN_ERROR`, code `abort` | `signal` → `run()` throws                            |
| Compaction      | [`compaction`](../agent/compaction.md)   | none                                                 |
| Model loading   | `ACTIVITY` events with progress          | loads at the first run, no progress: `engine.load()` |
| Calls stream    | yes                                      | no: one `tool-call` part when the call is complete   |
| Needs           | `-agui`, `@ag-ui/client`, `rxjs`         | the core only                                        |

| `ToolCallingAgent` option                        | Default                                                    |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `engine`                                         | required; loaded at the first run                          |
| `localTools`, `maxSteps`, `checks`, `repairHook` | as [`ToolCalling`](#options)                               |
| `tools`                                          | `[]`: `ToolSpec`s of tools the caller runs                 |
| `messages`                                       | `[]`: the conversation to start from, e.g. a system prompt |

| `run(input, { signal })` | Adds to `agent.messages`                                     |
| ------------------------ | ------------------------------------------------------------ |
| a string                 | one user message                                             |
| `ChatMessage[]`          | the messages as they are; a system message only as the first |
| `[]`                     | nothing: the model goes on, e.g. after `step-limit`          |

| Part           | Fields                                          | When                                                                                     |
| -------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `text`         | `text`                                          | the model writes the answer                                                              |
| `reasoning`    | `text`                                          | the model thinks (`<think>…</think>`); empty thinking is skipped                         |
| `tool-call`    | `call` `{ name, arguments }`, `result`, `steps` | a call passed repair and checks. Local tool: it ran, `result` went to the model          |
| `tool-call`    | `call`, `steps`, no `result`                    | a tool of `tools`: the run ends after this step, the caller runs it                      |
| `tool-error`   | `raw`, `error`                                  | a call could not be repaired or was cut off; the model got `error` and may call again    |
| `source-error` | `message`                                       | a tool source could not be read; the run goes on without it                              |
| `step-limit`   | `maxSteps`                                      | last part: `maxSteps` used up, the last tool results are not answered. `run([])` goes on |

| A run ends                                                    | `agent.messages` then end with                        |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| the model answers without a call                              | the answer                                            |
| after a step with a call to `tools`                           | the calls, and the results of that step's local tools |
| `step-limit`                                                  | the last tool results                                 |
| `signal` aborts, engine or tool source throws: `run()` throws | what they were before the run                         |
| the caller stops reading the parts                            | what they were before the run                         |

```ts
import { OutputParser } from '@soverius-ai/browser-models';

// With `tools: [setBackground]`: the caller runs the call and answers it with the next run.
let input = 'Make it blue';
while (input) {
  let next = '';
  for await (const part of agent.run(input)) {
    if (part.type === 'text') output.append(part.text);
    if (part.type === 'tool-call' && part.result === undefined) {
      document.body.style.background = String(part.call.arguments['color']);
      next = OutputParser.toolResult(part.call.name, 'done');
    }
  }
  input = next;
}
```

`messages` hold tool calls and results as the model sees them: ` ```tool_call ` blocks in assistant messages, ` ```tool_result ` blocks in user messages. A user message after unanswered tool results is joined to them.

## In the AG-UI agent

`ToolCalling` as the `tools` of `BrowserModelsAgent` ([Agent](../agent/index.md)):

```ts title="libs/examples/snippets/src/tools.ts"
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling, type LocalTool } from '@soverius-ai/browser-models-tools';

// Layer 3 with layer 2: the AG-UI agent with tool calling. It runs the tool, the model answers.
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

The model writes a call, the agent repairs and checks it, runs `execute`, gives the result back to the model, and the model answers. One run, up to `maxSteps` model calls.

## Options

| `ToolCalling` option | Default                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `localTools`         | `[]`: tools and tool sources that run here, in the agent                                                                          |
| `maxSteps`           | `5` model calls per run; used up, the run ends after the last tools ran (`ToolCallingAgent`: `step-limit` part)                   |
| `checks`             | `[]`: `ToolCheck`s after the schema, e.g. [`SandboxedUiCheck`](./generative-ui.md#open-generative-ui); one that throws is skipped |
| `repairHook`         | –, see [Repair](./repair.md#repair)                                                                                               |

| Kind          | Defined in                                 | Runs in | Run ends?                         |
| ------------- | ------------------------------------------ | ------- | --------------------------------- |
| Frontend tool | client (e.g. CopilotKit `useFrontendTool`) | client  | yes, client starts follow-up run  |
| Caller's tool | `ToolCallingAgent` `tools`                 | caller  | yes, caller starts follow-up run  |
| Local tool    | `localTools`                               | agent   | no, result goes back to the model |

## Local tool

```ts
import { ToolCalling, type LocalTool } from '@soverius-ai/browser-models-tools';

const currentTime: LocalTool = {
  name: 'currentTime',
  description: 'Returns the current local time.',
  parameters: { type: 'object', properties: {} },
  execute: async () => new Date().toLocaleTimeString(),
};

new ToolCalling({ localTools: [currentTime] });
```

Typed arguments: `const weather: LocalTool<{ city: string }> = { … }`. `execute(args, signal)` gets the repaired arguments; its result goes back to the model.

## Tool sources

Read at the start of every run. Name clash with a frontend tool: the frontend tool wins.
A failing source is skipped and reported: `CUSTOM` `soverius.tool_source_error` from the agent, a `source-error` part from `ToolCallingAgent`.
A tool source is any object with `tools(signal): Promise<readonly LocalTool[]>` (`LocalToolSource`).

```ts
import { ToolCalling } from '@soverius-ai/browser-models-tools';
import { McpTools } from '@soverius-ai/browser-models-tools/mcp';
import { WebMcpTools } from '@soverius-ai/browser-models-tools/webmcp';

new ToolCalling({
  localTools: [
    new WebMcpTools(),
    new McpTools({ url: 'https://example.com/mcp' }),
  ],
});
```

## Frontend tools without CopilotKit

The page declares its tools in `RunAgentInput.tools`, runs the calls, adds the results and runs again. CopilotKit does this by itself.

```ts
import type { Tool } from '@ag-ui/core';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling } from '@soverius-ai/browser-models-tools';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
  tools: new ToolCalling(),
});

const tools: Tool[] = [
  {
    name: 'change_background',
    description: 'Change the page background color.',
    parameters: {
      type: 'object',
      properties: { color: { type: 'string' } },
      required: ['color'],
    },
  },
];

agent.addMessage({
  id: crypto.randomUUID(),
  role: 'user',
  content: 'Make it blue',
});
for (let round = 0; round < 3; round++) {
  const { newMessages } = await agent.runAgent({ tools });
  // Calls of local tools are in newMessages too, already answered by a tool message.
  const answered = new Set(
    newMessages.flatMap((message) =>
      message.role === 'tool' ? [message.toolCallId] : [],
    ),
  );
  const calls = newMessages
    .flatMap((message) =>
      message.role === 'assistant' ? (message.toolCalls ?? []) : [],
    )
    .filter((call) => !answered.has(call.id));
  if (calls.length === 0) break;
  for (const call of calls) {
    const { color } = JSON.parse(call.function.arguments) as { color: string };
    document.body.style.background = color;
    agent.addMessage({
      id: crypto.randomUUID(),
      role: 'tool',
      toolCallId: call.id,
      content: `Background set to ${color}`,
    });
  }
}
```

Example: `apps/vanilla-agui` (`chat.ts`).

More: [Repair & streaming](./repair.md) · [MCP · WebMCP](./mcp.md) · [Generative UI](./generative-ui.md) · [Custom Tools](./custom.md). API: [browser-models-tools](../api/browser-models-tools/index.md)
