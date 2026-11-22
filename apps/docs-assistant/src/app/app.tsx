import { CopilotChat, CopilotKitProvider } from '@copilotkit/react-core/v2';
import { useDevtools, useModelStore } from '@soverius-ai/browser-models-react';
import { devtoolsFromUrl, statusBadge } from '@soverius-ai/example-shared';
import { useEffect } from 'react';
import { agent, labels, pickModel, store } from './agent';
import { DocsTools } from './docs-tools';
import { modelActivityRenderer } from './model-activity';

/** Inside the docs site's side panel: a compact header. */
const embedded = new URLSearchParams(location.search).has('embedded');

export function App() {
  const state = useModelStore(store);
  useDevtools(agent, import.meta.env.DEV || devtoolsFromUrl());
  useEffect(() => void pickModel(), []);

  return (
    <CopilotKitProvider
      agents__unsafe_dev_only={{ default: agent }}
      renderActivityMessages={[modelActivityRenderer]}
    >
      <DocsTools />
      <main className="flex h-full flex-col">
        <header className="border-b border-base-300 bg-base-100">
          <nav className="flex flex-wrap items-center gap-2 px-4 py-2">
            {!embedded && (
              <>
                <img
                  src={`${import.meta.env.BASE_URL}favicon.svg`}
                  alt="Soverius AI"
                  className="size-7"
                />
                <h1 className="text-base font-semibold">browser-models</h1>
              </>
            )}
            <span className="badge badge-soft badge-primary">Ask the docs</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                className="select select-sm w-56"
                aria-label="Model"
                value={state.selectedModel}
                onChange={(event) => void store.selectModel(event.target.value)}
              >
                {store.modelIds.map((id) => (
                  <option key={id} value={id}>
                    {labels[id as keyof typeof labels]}
                  </option>
                ))}
              </select>
              <span
                data-testid="model"
                className={`badge badge-soft ${statusBadge(state.availability)}`}
              >
                {agent.engine().id} · {state.availability}
              </span>
              {state.availability === 'downloadable' && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void store.download()}
                >
                  Download the model
                </button>
              )}
              {state.availability === 'downloading' && (
                <progress
                  className="progress progress-primary w-28"
                  value={state.progress ?? 0}
                />
              )}
            </div>
          </nav>
          {!embedded && (
            <p className="px-4 pb-2 text-sm opacity-70">
              A model in your browser answers from these docs. It searches them
              with a tool of the agent, and shows the page with a tool of this
              page. Nothing is sent to a server.
            </p>
          )}
          {state.error && (
            <p
              role="alert"
              className="alert alert-error alert-soft m-2 py-2 text-sm"
            >
              {state.error}
            </p>
          )}
        </header>
        {state.availability === 'available' && (
          <div className="min-h-0 flex-1">
            <CopilotChat />
          </div>
        )}
      </main>
    </CopilotKitProvider>
  );
}
