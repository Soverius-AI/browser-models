---
title: Tools
---

# Tools

| Kind          | Defined in                                 | Runs in | Run ends?                         |
| ------------- | ------------------------------------------ | ------- | --------------------------------- |
| Frontend tool | client (e.g. CopilotKit `useFrontendTool`) | client  | yes, client starts follow-up run  |
| Local tool    | `localTools`                               | agent   | no, result goes back to the model |

## Local tool

```ts
import type { LocalTool } from '@soverius-ai/browser-models';
import { BrowserModelsAgent } from '@soverius-ai/browser-models/agent';

const currentTime: LocalTool = {
  name: 'currentTime',
  description: 'Returns the current local time.',
  parameters: { type: 'object', properties: {} },
  execute: async () => new Date().toLocaleTimeString(),
};

new BrowserModelsAgent({
  models,
  defaultModel: 'nano',
  localTools: [currentTime],
});
```

Typed arguments: `const weather: LocalTool<{ city: string }> = { … }`. `execute(args, signal)` gets the repaired arguments; its result goes back to the model.

## Tool sources

Read at the start of every run. Name clash with a frontend tool: the frontend tool wins.
A failing source is skipped and reported as `CUSTOM` `soverius.tool_source_error`.
A tool source is any object with `tools(signal): Promise<readonly LocalTool[]>` (`LocalToolSource`).

```ts
import { McpTools } from '@soverius-ai/browser-models/mcp';
import { WebMcpTools } from '@soverius-ai/browser-models/webmcp';

new BrowserModelsAgent({
  models,
  defaultModel: 'nano',
  localTools: [
    currentTime,
    new WebMcpTools(),
    new McpTools({ url: 'https://example.com/mcp' }),
  ],
});
```

## WebMCP

```ts
import { WebMcpTools } from '@soverius-ai/browser-models/webmcp';

new WebMcpTools({
  filter: (tool) => tool.name !== 'checkout',
  confirm: async (tool) => window.confirm(tool.name),
});
```

| Option         | Default                                                                            |
| -------------- | ---------------------------------------------------------------------------------- |
| `filter`       | all page tools                                                                     |
| `confirm`      | `window.confirm`                                                                   |
| `modelContext` | `document.modelContext` (native, or `installWebMCP()` from `@w3c/webmcp-polyfill`) |

| Page tool              | Behaviour                     |
| ---------------------- | ----------------------------- |
| `consequentialHint`    | `confirm()` first             |
| `untrustedContentHint` | result wrapped as data        |
| navigates (`null`)     | `{ navigated }` as the result |

## MCP

```ts
import { McpTools } from '@soverius-ai/browser-models/mcp';

new McpTools({
  url: 'https://example.com/mcp',
  namespace: 'docs', // tool names: docs__<name>
  headers: async () => ({ Authorization: `Bearer ${token}` }),
});
```

| Option            | Default                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `url`             | required: the Streamable HTTP endpoint                                   |
| `namespace`       | none; `ns` → tool names `ns__<name>`                                     |
| `headers`         | none; called on every request, sync or async                             |
| `filter`          | all server tools                                                         |
| `confirm`         | `window.confirm`                                                         |
| `fetch`           | global `fetch`                                                           |
| `timeout`         | `30_000` ms per request                                                  |
| `maxResultLength` | `3000` characters of text per tool result; longer text is cut and marked |

| Aspect            | Behaviour                                                 |
| ----------------- | --------------------------------------------------------- |
| Transport         | Streamable HTTP (JSON or SSE answers), `Mcp-Session-Id`   |
| Methods           | `initialize`, `tools/list` (paged), `tools/call`          |
| `destructiveHint` | `confirm()` first                                         |
| Results           | wrapped as data; `isError` → `{ error }`                  |
| Server            | must allow your origin (CORS) and expose `Mcp-Session-Id` |

### Context7 example

[Context7](https://context7.com) serves library docs from a remote MCP server that allows any origin. The API key is optional (higher rate limits). The `headers` function runs on every request, so it always sends the current key.

```ts
let apiKey = ''; // from a password input; keep it out of localStorage and URLs

new McpTools({
  url: 'https://mcp.context7.com/mcp',
  namespace: 'context7', // context7__resolve-library-id, context7__query-docs
  headers: () => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
});
```

The [vanilla example](./vanilla.md) has it behind a "Use Context7" toggle: try `docs for react`. Its local `/mcp` demo server needs the dev or preview server, so it is missing in the static playground build. Context7 is remote and works there too.

## Call formats

| Format | Example                                          |
| ------ | ------------------------------------------------ |
| fenced | ` ```tool_call {"name": …, "arguments": …} ``` ` |
| tags   | `<tool_call>{…}</tool_call>`                     |

## Streaming

A call is sent while the model writes it. Repair runs once, when the call is complete.

| When                              | Events                                                                |
| --------------------------------- | --------------------------------------------------------------------- |
| name complete, tool known         | `TOOL_CALL_START` (repaired name)                                     |
| arguments arrive                  | `TOOL_CALL_ARGS` deltas                                               |
| output done, repair changed none  | `TOOL_CALL_ARGS` (the rest), `TOOL_CALL_END`                          |
| repair changed name or arguments  | `CUSTOM` `soverius.tool_repair`, `MESSAGES_SNAPSHOT`, `TOOL_CALL_END` |
| not repairable, cut off, or abort | `MESSAGES_SNAPSHOT` (call removed), `TOOL_CALL_END`                   |

```text
clean      START  ARGS {"city":"Vie  ARGS nna"  ARGS }                 END
repaired   START  ARGS {"days":"3"   CUSTOM  MESSAGES_SNAPSHOT {"days":3}  END
```

- At `TOOL_CALL_END` the client holds the repaired call: joined deltas, or the snapshot.
- `MESSAGES_SNAPSHOT` = the run's input messages + this run's messages. AG-UI has no event to take back sent arguments.
- Unknown tool name: nothing is streamed.
- A call the output ends in (for example the token limit) is not run. The model is told.

## Repair

Every call is repaired before it runs. First step that yields a valid call wins.

| Step     | Fixes                                                                       |
| -------- | --------------------------------------------------------------------------- |
| `json`   | broken JSON (`jsonrepair`), arguments as string                             |
| `name`   | case, `snake_case`, `functions.` prefix, small typos                        |
| `coerce` | `"5"` → `5`, `"true"` → `true`, value → array, defaults, extra keys, `null` |
| `reask`  | one more model call with the call, the error and the schema                 |
| `hook`   | `repairHook({ raw, error, tools })`                                         |

Not repairable, or re-ask / hook throws: error goes back to the model as a tool result.
