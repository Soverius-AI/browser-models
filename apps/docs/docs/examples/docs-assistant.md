---
title: Docs assistant
---

# Docs assistant

"Ask the docs" on every page of this site: a model in your browser answers from these docs. It searches them with a tool of the agent and shows the page with a tool of the page. No server, no search service. Code: `apps/docs-assistant`.

```mermaid
sequenceDiagram
  participant U as You
  participant C as CopilotKit chat
  participant A as BrowserModelsAgent
  participant D as DocsIndex
  U->>C: how do I check the Prompt API?
  C->>A: run (with the showDocsPage tool and the instructions)
  A->>A: model: searchDocs({ query })
  A->>D: search
  D-->>A: best sections
  A-->>C: TOOL_CALL_* searchDocs, TOOL_CALL_RESULT → source chips
  A->>A: model: answer + showDocsPage({ url, title })
  A-->>C: text, TOOL_CALL_* showDocsPage
  C->>C: page card; "Open" → the docs site navigates
```

## Layer by layer

| Layer         | What it does here                                                               | Code             |
| ------------- | ------------------------------------------------------------------------------- | ---------------- |
| docs          | the Markdown of this site, bundled with `import.meta.glob`, split into sections | `docs-index.ts`  |
| 1 · engines   | Gemini Nano if the browser has it, else Gemma 4 on WebLLM (16k context)         | `agent.ts`       |
| 2 · agent     | `BrowserModelsAgent`; CopilotKit talks to it                                    | `agent.ts`       |
| 3 · tools     | `searchDocs`, `readDocs`: tools of the agent, results go back to the model      | `agent.ts`       |
| generative UI | `searchDocs` rendered as source chips, `showDocsPage` as a page card            | `docs-tools.tsx` |
| instructions  | CopilotKit `useAgentContext`: search first, answer only from the results        | `docs-tools.tsx` |

## The tools of the agent

```ts
const searchDocs: LocalTool<{ query: string }> = {
  name: 'searchDocs',
  description:
    'Searches the browser-models docs by keywords. Returns the best sections: id, page, title, url and an excerpt.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  execute: async ({ query }) => docs.search(query),
};

export const agent = new BrowserModelsAgent({
  models: { nano, gemma, demo },
  defaultModel: 'gemma',
  tools: new ToolCalling({ localTools: [searchDocs, readDocs], maxSteps: 6 }),
});
```

## The tools of the page

```tsx
// The call runs in the agent, but CopilotKit sees it: show what was found.
useRenderTool({
  name: 'searchDocs',
  parameters: z.object({ query: z.string() }),
  render: ({ parameters, status, result }) => <SearchResults query={parameters.query} hits={…} />,
}, []);

// A frontend tool: the model calls it, the page shows a card.
useFrontendTool({
  name: 'showDocsPage',
  description: 'Shows the user a card that opens the docs page answering the question.',
  parameters: z.object({ url: z.string(), title: z.string() }),
  handler: async ({ url }) => `Shown ${url}`,
  render: ({ args }) => <PageCard url={args.url} title={args.title} />,
}, []);
```

## In this site

`src/theme/Root.tsx` adds the "Ask the docs" button. The panel is the app in an iframe (`/examples/assistant/?embedded`), created on the first click: no model loads before. "Open" posts `{ source: 'docs-assistant', url }` to the site, which navigates.

| Piece      | Size and cost                                                    |
| ---------- | ---------------------------------------------------------------- |
| docs index | all pages incl. the API reference, built in the browser at start |
| search     | keyword scoring with heading boost, no dependency                |
| model      | Gemini Nano: built in; Gemma 4 E2B: one download, cached         |

Try it: the "Ask the docs" button, or the [Playground](/playground?platform=assistant) with the demo model.
