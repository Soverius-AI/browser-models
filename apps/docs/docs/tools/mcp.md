---
title: MCP · WebMCP
---

# MCP · WebMCP

Tool sources for `ToolCalling`'s `localTools`: read at the start of every run.

## MCP

```ts
import { McpTools } from '@soverius-ai/browser-models-tools/mcp';

let token = ''; // set when the user signs in

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
import { McpTools } from '@soverius-ai/browser-models-tools/mcp';

let apiKey = ''; // from a password input; keep it out of localStorage and URLs

new McpTools({
  url: 'https://mcp.context7.com/mcp',
  namespace: 'context7', // context7__resolve-library-id, context7__query-docs
  headers: () => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
});
```

The vanilla example (`apps/vanilla-agui`) has it behind a "Use Context7" toggle: try `docs for react`. Its local `/mcp` demo server needs the dev or preview server, so it is missing in the static playground build. Context7 is remote and works there too.

## WebMCP

```ts
import { WebMcpTools } from '@soverius-ai/browser-models-tools/webmcp';

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

API: [mcp](../api/browser-models-tools/mcp.md), [webmcp](../api/browser-models-tools/webmcp.md)
