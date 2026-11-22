---
title: Without CopilotKit
---

# Without CopilotKit

The agent is an AG-UI `AbstractAgent`: `@ag-ui/client` drives it directly.

```ts
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
});

agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: 'Hello' });
await agent.runAgent(
  {},
  {
    onReasoningMessageContentEvent: ({ event }) => showThinking(event.delta),
    onTextMessageContentEvent: ({ event }) => showAnswer(event.delta),
    onRunErrorEvent: ({ event }) => showError(event.message),
  },
);
```

The agent keeps the conversation in `agent.messages`; every `runAgent()` continues it.

## Frontend tools

The page declares its tools in `RunAgentInput.tools`, runs the calls, adds the results and runs again. The agent needs `tools: new ToolCalling()` to offer them to the model.

```ts
import type { Tool, ToolCall } from '@ag-ui/core';
import { ToolCalling } from '@soverius-ai/browser-models-tools';

const agent = new BrowserModelsAgent({
  models,
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
  const calls: ToolCall[] = newMessages.flatMap((message) =>
    message.role === 'assistant' ? (message.toolCalls ?? []) : [],
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

Tools of the agent (`localTools`) already ran inside the run; only the page's own tools come back here.

## Model state

```ts
import { ModelStore } from '@soverius-ai/browser-models';

const store = new ModelStore(agent);
store.subscribe(() => (status.textContent = store.getState().availability));
downloadButton.onclick = () => store.download();
```

See [Model picker & downloads](../engines/models.md).

## As an async generator

`AgentRun` is the run without `AbstractAgent` or rxjs: an async generator of AG-UI events.

```ts
import { EventType } from '@ag-ui/core';
import { AgentRun } from '@soverius-ai/browser-models-agui';

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

Examples: `apps/agent-chat` (no tools), `apps/vanilla-agui` (frontend tool, local tool, WebMCP, MCP). [Playground](/playground?platform=vanilla)
