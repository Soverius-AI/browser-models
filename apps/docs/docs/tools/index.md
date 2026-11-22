---
title: ToolCalling
---

# ToolCalling

Layer 3, `@soverius-ai/browser-models-tools`. Without it the agent only chats.

```bash
pnpm add @soverius-ai/browser-models-tools
```

## A first tool

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

The model writes a call, the agent repairs and checks it, runs `execute`, gives the result back to the model, and the model answers. One run, up to `maxSteps` model calls. ## Frontend tools without CopilotKit

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

More: [Repair & streaming](./repair.md).

## Options

| `ToolCalling` option | Default                                   |
| -------------------- | ----------------------------------------- |
| `localTools`         | `[]`: tools and tool sources of the agent |
| `maxSteps`           | `5` model calls per run                   |
| `repairHook`         | –, see [Repair](./repair.md#repair)       |

| Kind          | Defined in                                 | Runs in | Run ends?                         |
| ------------- | ------------------------------------------ | ------- | --------------------------------- |
| Frontend tool | client (e.g. CopilotKit `useFrontendTool`) | client  | yes, client starts follow-up run  |
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
A failing source is skipped and reported as `CUSTOM` `soverius.tool_source_error`.
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
