import {
  useAgentContext,
  useFrontendTool,
  useRenderTool,
} from '@copilotkit/react-core/v2';
import { z } from 'zod';
import { instructions } from './agent';
import type { DocsHit } from './docs-index';

/** The docs site the "Open" buttons go to when the assistant runs on its own. */
const DOCS_SITE =
  (import.meta.env['VITE_DOCS_URL'] as string | undefined) ??
  'https://browser-models.soverius.ai';

/**
 * Opens a docs page. Inside the docs site's panel, the site navigates; on its own, the page
 * opens in a new tab.
 */
export function openDocsPage(url: string): void {
  if (window.parent !== window)
    window.parent.postMessage(
      { source: 'docs-assistant', url },
      location.origin,
    );
  else window.open(new URL(url, DOCS_SITE), '_blank', 'noopener');
}

/** The tool UI and the instructions, registered with CopilotKit. Renders nothing itself. */
export function DocsTools() {
  useAgentContext({ description: 'How to answer', value: instructions });

  // searchDocs runs in the agent; CopilotKit still sees the call and its result, so the chat
  // shows which sections the model found.
  useRenderTool(
    {
      name: 'searchDocs',
      parameters: z.object({ query: z.string() }),
      render: ({ parameters, status, result }) => (
        <SearchResults
          query={parameters.query ?? ''}
          hits={status === 'complete' ? readHits(result) : undefined}
        />
      ),
    },
    [],
  );

  // A frontend tool: the model calls it, the page shows a card. Generative UI.
  useFrontendTool(
    {
      name: 'showDocsPage',
      description:
        'Shows the user a card that opens the docs page answering the question.',
      parameters: z.object({
        url: z.string().describe('The url of a section from searchDocs'),
        title: z.string().describe('The title of that section'),
      }),
      handler: async ({ url }) => `Shown ${url}`,
      render: ({ args }) => (
        <PageCard url={args.url ?? ''} title={args.title ?? ''} />
      ),
    },
    [],
  );

  return null;
}

function readHits(result: string): DocsHit[] {
  try {
    const hits: unknown = JSON.parse(result);
    return Array.isArray(hits) ? (hits as DocsHit[]) : [];
  } catch {
    return [];
  }
}

function SearchResults({
  query,
  hits,
}: {
  query: string;
  hits: DocsHit[] | undefined;
}) {
  return (
    <div className="docs-search my-1 text-sm" data-testid="docs-search">
      <p className="opacity-70">
        {hits
          ? `Searched the docs for “${query}”`
          : `Searching the docs for “${query}”…`}
      </p>
      {hits && (
        <ul className="mt-1 flex flex-wrap gap-1">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="badge badge-soft badge-primary cursor-pointer"
                title={hit.excerpt}
                onClick={() => openDocsPage(hit.url)}
              >
                {hit.page === hit.title
                  ? hit.page
                  : `${hit.page} › ${hit.title}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PageCard({ url, title }: { url: string; title: string }) {
  return (
    <div
      className="docs-page my-2 flex max-w-md items-center gap-3 rounded-box border border-base-300 bg-base-100 p-3 shadow-sm"
      data-testid="docs-page"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {title || '…'}
        </span>
        <span className="block truncate font-mono text-xs opacity-60">
          {url}
        </span>
      </span>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={!url}
        onClick={() => openDocsPage(url)}
      >
        Open
      </button>
    </div>
  );
}
