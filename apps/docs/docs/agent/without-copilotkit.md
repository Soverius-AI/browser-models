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
const thinking = document.body.appendChild(document.createElement('details'));
const answer = document.body.appendChild(document.createElement('p'));

agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: 'Hello' });
await agent.runAgent(
  {},
  {
    onReasoningMessageContentEvent: ({ event }) =>
      void thinking.append(event.delta),
    onTextMessageContentEvent: ({ event }) => void answer.append(event.delta),
    onRunErrorEvent: ({ event }) => void (answer.textContent = event.message),
  },
);
```

The agent keeps the conversation in `agent.messages`; every `runAgent()` continues it.

Frontend tools (the page runs the calls) need `ToolCalling`: [ToolCalling → Frontend tools without CopilotKit](../tools/index.md#frontend-tools-without-copilotkit).

## Model state

```ts
import { ModelStore } from '@soverius-ai/browser-models';

const store = new ModelStore(agent);
const availability = document.body.appendChild(document.createElement('p'));
const download = document.body.appendChild(document.createElement('button'));

download.textContent = 'Download';
download.onclick = () => void store.download();
store.subscribe(() => {
  availability.textContent = store.getState().availability;
});
```

See [Model picker & downloads](../engines/models.md).

## As an async generator

`AgentRun` is the run without `AbstractAgent` or rxjs: an async generator of AG-UI events.

```ts
import { EventType } from '@ag-ui/core';
import { AgentRun } from '@soverius-ai/browser-models-agui';
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

Examples: `apps/agent-chat` (no tools), `apps/vanilla-agui` (frontend tool, local tool, WebMCP, MCP). [Playground](/playground?platform=vanilla)
