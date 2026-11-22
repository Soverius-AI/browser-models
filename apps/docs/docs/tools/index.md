---
title: ToolCalling
---

# ToolCalling

Layer 3, `@soverius-ai/browser-models-tools`. Without it the agent only chats.

```bash
pnpm add @soverius-ai/browser-models-tools
```

```ts
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling } from '@soverius-ai/browser-models-tools';

new BrowserModelsAgent({
  models,
  defaultModel: 'nano',
  tools: new ToolCalling({ localTools: [currentTime], maxSteps: 5 }),
});
```

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
import type { LocalTool } from '@soverius-ai/browser-models-tools';

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
import { McpTools } from '@soverius-ai/browser-models-tools/mcp';
import { WebMcpTools } from '@soverius-ai/browser-models-tools/webmcp';

new ToolCalling({
  localTools: [
    currentTime,
    new WebMcpTools(),
    new McpTools({ url: 'https://example.com/mcp' }),
  ],
});
```

More: [Repair & streaming](./repair.md) · [MCP · WebMCP](./mcp.md) · [Generative UI](./generative-ui.md) · [Custom Tools](./custom.md). API: [browser-models-tools](../api/browser-models-tools/index.md)
