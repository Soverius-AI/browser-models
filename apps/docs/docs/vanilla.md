---
title: Vanilla JS
---

# Vanilla JS

## Install

```bash
pnpm add @soverius-ai/browser-models
```

## Setup

```ts
import { BrowserModelsAgent } from '@soverius-ai/browser-models/agent';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
});

const output = document.querySelector('#output')!;

agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: 'Hello' });
await agent.runAgent(
  {},
  {
    onTextMessageContentEvent: ({ event }) => {
      output.textContent += event.delta;
    },
  },
);
```

## Model state

```ts
import { ModelStore } from '@soverius-ai/browser-models/agent';

const models = new ModelStore(agent);
const status = document.querySelector('#status')!;

models.subscribe(() => {
  status.textContent = models.getState().availability;
});
document
  .querySelector('#download')!
  .addEventListener('click', () => models.download());
```

See [Model state](./models.md).

## Devtools

```ts
const stop = agent.connectDevtools();
```

See [Agent → Devtools](./agent.md#devtools).

## Frontend tools without CopilotKit

The client declares frontend tools in `RunAgentInput.tools`, runs them, adds the results and runs again.

```ts
import type { Tool, ToolCall } from '@ag-ui/core';

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
const names = new Set(tools.map((tool) => tool.name));

agent.addMessage({
  id: crypto.randomUUID(),
  role: 'user',
  content: 'Make it blue',
});
for (let round = 0; round < 3; round++) {
  const { newMessages } = await agent.runAgent({ tools });
  // Local tool calls are in newMessages too: they already ran in the agent.
  const calls: ToolCall[] = newMessages.flatMap((message) =>
    message.role === 'assistant'
      ? (message.toolCalls ?? []).filter((call) =>
          names.has(call.function.name),
        )
      : [],
  );
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

## Model loading progress

```ts
import { MODEL_ACTIVITY } from '@soverius-ai/browser-models';

await agent.runAgent(
  {},
  {
    onActivitySnapshotEvent: ({ event }) => {
      if (event.activityType === MODEL_ACTIVITY) console.log(event.content);
    },
  },
);
```

Content: [Agent → Model loading](./agent.md#model-loading).

## As an async generator

`new AgentRun(options).events()` from the root entry is an async generator of AG-UI events, without `AbstractAgent` or rxjs.

```ts
import { EventType } from '@ag-ui/core';
import { AgentRun } from '@soverius-ai/browser-models';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

const run = new AgentRun({
  engine: new PromptApiEngine(),
  input: {
    threadId: 't1',
    runId: 'r1',
    messages: [{ id: '1', role: 'user', content: 'Hello' }],
    tools: [],
    context: [],
  },
});
for await (const event of run.events()) {
  if (event.type === EventType.TEXT_MESSAGE_CONTENT) console.log(event.delta);
}
```

Example: `apps/vanilla-agui` (frontend tool, local tool, WebMCP tool, demo MCP server at `/mcp`, Context7 over remote MCP).

Try it: [Playground](/playground?platform=vanilla).
