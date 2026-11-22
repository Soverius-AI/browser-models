import { CopilotChat, CopilotKitProvider } from '@copilotkit/react-core/v2';
import { useDevtools, useModelStore } from '@soverius-ai/browser-models-react';
import {
  devtoolsFromUrl,
  modelLabel,
  sandboxDesignSkill,
  statusBadge,
} from '@soverius-ai/example-shared';
import { agent, context7, models } from './agent';
import { TodoManager } from './copilotkit-docs/todo-manager';
import { WeatherWidget } from './copilotkit-docs/weather-widget';
import { modelActivityRenderer } from './model-activity';
import { ModelsPanel } from './models-panel';
import { TripPlan } from './trip-plan';

// Created once: CopilotKit sets its renderers up again whenever these change.
const agents = { default: agent };
const openGenerativeUI = { designSkill: sandboxDesignSkill };
const activityRenderers = [modelActivityRenderer];

export function App() {
  const state = useModelStore(models);
  useDevtools(agent, import.meta.env.DEV || devtoolsFromUrl());

  return (
    // `agents__unsafe_dev_only` is CopilotKit React's prop for agents that run in the page.
    // (`selfManagedAgents` does the same but logs a license warning.)
    <CopilotKitProvider
      agents__unsafe_dev_only={agents}
      // Registers the `generateSandboxedUi` tool and the sandbox renderer (JetBrains websandbox).
      openGenerativeUI={openGenerativeUI}
      renderActivityMessages={activityRenderers}
    >
      <main className="flex h-full flex-col">
        <header className="border-b border-base-300 bg-base-100">
          <nav className="navbar min-h-14 flex-wrap gap-2 px-4">
            <a
              className="flex items-center gap-2 font-semibold"
              href="https://soverius.ai"
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={`${import.meta.env.BASE_URL}favicon.svg`}
                alt="Soverius AI"
                className="size-7"
              />
              <h1 className="text-base font-semibold">browser-models</h1>
            </a>
            <span className="badge badge-soft badge-primary">React</span>
            {context7.enabled && (
              <span className="badge badge-soft badge-accent">
                MCP · Context7
              </span>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                className="select select-sm w-72"
                aria-label="Model"
                value={state.selectedModel}
                onChange={(event) =>
                  void models.selectModel(event.target.value)
                }
              >
                {models.modelIds.map((id) => (
                  <option key={id} value={id}>
                    {modelLabel(id)}
                  </option>
                ))}
              </select>

              <span
                data-testid="model"
                className={`badge badge-soft ${statusBadge(state.availability)}`}
              >
                {models.agent.engine(state.selectedModel).id} ·{' '}
                {state.availability}
              </span>

              {state.availability === 'downloadable' && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void models.download()}
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

          <div className="flex flex-col gap-2 px-4 pb-3">
            {state.availability === 'unavailable' && (
              <p
                role="alert"
                className="alert alert-warning alert-soft py-2 text-sm"
              >
                This model cannot run in this browser (no Prompt API or no
                WebGPU). Pick another one.
              </p>
            )}
            {state.error && (
              <p
                role="alert"
                className="alert alert-error alert-soft py-2 text-sm"
              >
                {state.error}
              </p>
            )}
            <ModelsPanel />
            <TodoManager />
            <WeatherWidget />
            <TripPlan />
          </div>
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

export default App;
