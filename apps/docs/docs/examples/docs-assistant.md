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

| Layer         | What it does here                                                                                                    | Code                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| docs          | the Markdown of this site, bundled with `import.meta.glob`, split into sections                                      | `agent.ts` (glob), `docs-index.ts` (sections, search) |
| 1 · engines   | Gemini Nano if the browser has it, else Gemma 4 on WebLLM (16k context); `?model=<id>` overrides; `demo` is scripted | `agent.ts`                                            |
| 2 · tools     | `searchDocs`, `readDocs`: tools of the agent, results go back to the model                                           | `agent.ts`                                            |
| 3 · agent     | `BrowserModelsAgent`; CopilotKit talks to it                                                                         | `agent.ts`                                            |
| generative UI | `searchDocs` rendered as source chips, `showDocsPage` as a page card                                                 | `docs-tools.tsx`                                      |
| instructions  | CopilotKit `useAgentContext`: search first, answer only from the results                                             | `docs-tools.tsx`                                      |

## The tools of the agent

```ts
// agent.ts
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import {
  ToolCalling,
  type LocalTool,
  type ToolCheck,
} from '@soverius-ai/browser-models-tools';
import { demoEngine } from '@soverius-ai/example-shared';

// `docs`: the DocsIndex of docs-index.ts, built from the bundled Markdown.

const engines = {
  nano: new PromptApiEngine({ sampling: 'predictable' }),
  gemma: new WebLlmEngine('gemma-4-E2B-it-q4f16_1-MLC', {
    contextWindowSize: 16384,
    sampling: 'predictable',
  }),
  demo: demoEngine(),
};

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

const readDocs: LocalTool<{ id: string }> = {
  name: 'readDocs',
  description:
    'Reads one section of the docs by the id searchDocs returned, when its excerpt is not enough.',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  execute: async ({ id }) => {
    const section = docs.section(id);
    return section
      ? {
          title: section.title,
          url: section.url,
          text: section.text.slice(0, 2000),
        }
      : { error: `No section "${id}". Use an id from searchDocs.` };
  },
};

// A placeholder query ("keyword", "…") goes back to the model, which then uses the question's words.
const realQuery: ToolCheck = {
  tool: 'searchDocs',
  check: ({ query }) =>
    /^\s*(…|\.\.\.|(your )?(keywords?|search (terms?|keywords?))( here)?)\s*$/i.test(
      String(query),
    )
      ? 'the query is a placeholder; search with words from the question'
      : undefined,
};

export const agent = new BrowserModelsAgent({
  agentId: 'default',
  models: engines,
  defaultModel: 'gemma',
  tools: new ToolCalling({
    localTools: [searchDocs, readDocs],
    checks: [realQuery],
    maxSteps: 6,
  }),
});

export const instructions = [
  'You answer questions about browser-models, a library that runs language models in the browser.',
  'Always call searchDocs first, with the key words of the question.',
  'If an excerpt is not enough, call readDocs with the id of the best section.',
  'Answer only from what the tools returned, briefly, with a short code example when it helps.',
  'When one section answers the question, call showDocsPage with its url and title.',
  'If the docs do not answer the question, say so.',
].join('\n');
```

## The tools of the page

```tsx
// docs-tools.tsx
import {
  useAgentContext,
  useFrontendTool,
  useRenderTool,
} from '@copilotkit/react-core/v2';
import { z } from 'zod';
import { instructions } from './agent';

export function DocsTools() {
  useAgentContext({ description: 'How to answer', value: instructions });

  // searchDocs runs in the agent, but CopilotKit sees the call and its result.
  useRenderTool(
    {
      name: 'searchDocs',
      parameters: z.object({ query: z.string() }),
      render: ({ parameters, status, result }) =>
        status === 'complete' ? (
          <SearchResults hits={JSON.parse(result) as Hit[]} />
        ) : (
          <p>Searching the docs for “{parameters.query}”…</p>
        ),
    },
    [],
  );

  // A frontend tool: the model calls it, the page shows a card.
  useFrontendTool(
    {
      name: 'showDocsPage',
      description:
        'Shows the user a card that opens the docs page answering the question.',
      parameters: z.object({ url: z.string(), title: z.string() }),
      handler: async ({ url }) => `Shown ${url}`,
      render: ({ args }) => <a href={args.url}>{args.title ?? '…'}</a>,
    },
    [],
  );

  return null;
}

type Hit = { id: string; title: string; url: string };

function SearchResults({ hits }: { hits: Hit[] }) {
  return (
    <ul>
      {hits.map((hit) => (
        <li key={hit.id}>
          <a href={hit.url}>{hit.title}</a>
        </li>
      ))}
    </ul>
  );
}
```

The app's `docs-tools.tsx` adds source chips and the page card; "Open": embedded, a `postMessage` to the site, which navigates; on its own, a new tab on the docs site (`VITE_DOCS_URL`, default browser-models.soverius.ai).

## In this site

`src/theme/Root.tsx` adds the "Ask the docs" button. The panel is the app in an iframe (`/examples/assistant/?embedded`), created on the first click: no model loads before. "Open" posts `{ source: 'docs-assistant', url }` to the site, which navigates.

| Piece      | Size and cost                                                    |
| ---------- | ---------------------------------------------------------------- |
| docs index | all pages incl. the API reference, built in the browser at start |
| search     | keyword scoring with heading boost, no dependency                |
| model      | Gemini Nano: built in; Gemma 4 E2B: one download, cached         |

Try it: the "Ask the docs" button, or the [Playground](/playground?platform=assistant) with the demo model.
