# @soverius-ai/browser-models-tools

Tool calling for `@soverius-ai/browser-models-agui`: every call is repaired and checked against its JSON Schema, the agent's own tools run in the page, the client's tools in the client.

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

Entries: `.`, `/mcp` (MCP servers), `/webmcp` (tools of the page), `/copilotkit` (CopilotKit generative UI).

[Docs](https://browser-models.soverius.ai/docs) · [Playground](https://browser-models.soverius.ai/playground) · by [Soverius AI](https://soverius.ai) · MIT
