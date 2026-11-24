# @soverius-ai/browser-models-tools

Tool calling for `@soverius-ai/browser-models-agui` (`ToolCalling`), or on an engine without AG-UI (`ToolCallingAgent`): every call is repaired and checked against its JSON Schema, the agent's own tools run in the page, the client's tools in the client.

## With the AG-UI agent

```bash
pnpm add @soverius-ai/browser-models @soverius-ai/browser-models-agui @soverius-ai/browser-models-tools
```

```ts
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling } from '@soverius-ai/browser-models-tools';
import { McpTools } from '@soverius-ai/browser-models-tools/mcp';

const agent = new BrowserModelsAgent({
  models,
  defaultModel: 'gemma',
  tools: new ToolCalling({ localTools: [weather, new McpTools({ url })] }),
});
```

## On an engine, no AG-UI

```bash
pnpm add @soverius-ai/browser-models @soverius-ai/browser-models-tools
```

```ts
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { ToolCallingAgent } from '@soverius-ai/browser-models-tools';

const agent = new ToolCallingAgent({
  engine: new PromptApiEngine(),
  localTools: [weather],
});
for await (const part of agent.run('Weather in Vienna?')) {
  if (part.type === 'tool-call') console.log(part.call, part.result);
  if (part.type === 'text') output.append(part.text);
}
// agent.messages holds the conversation; the next run() continues it.
```

Entries: `.`, `/mcp` (MCP servers), `/webmcp` (tools of the page), `/copilotkit` (CopilotKit generative UI).

[Docs](https://browser-models.soverius.ai/docs) · [Playground](https://browser-models.soverius.ai/playground) · by [Soverius AI](https://soverius.ai) · MIT
