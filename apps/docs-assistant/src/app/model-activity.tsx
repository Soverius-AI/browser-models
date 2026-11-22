import type { CSSProperties } from 'react';
import type { ReactActivityMessageRenderer } from '@copilotkit/react-core/v2';
import { MODEL_ACTIVITY } from '@soverius-ai/browser-models-agui';
import {
  modelActivitySchema,
  modelActivityView,
  type ModelActivity,
  type ModelActivityView,
} from '@soverius-ai/example-shared';

function ModelActivityCard({ view }: { view: ModelActivityView }) {
  return (
    <div className="model-activity my-2 flex w-full max-w-sm items-center gap-3 rounded-box border border-base-300 bg-base-100 p-3 shadow-sm">
      {view.ready ? (
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success/15 text-success">
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      ) : (
        <span
          className="radial-progress shrink-0 text-[0.65rem] font-semibold text-primary"
          style={
            {
              '--value': view.percent,
              '--size': '2.75rem',
              '--thickness': '3px',
            } as CSSProperties
          }
          role="progressbar"
          aria-valuenow={view.percent}
        >
          {view.percent}%
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{view.title}</span>
        <span className="block text-xs opacity-60">{view.detail}</span>
      </span>
    </div>
  );
}

/** Shows the agent's model loading progress (`soverius.model` activity) in the chat. */
export const modelActivityRenderer: ReactActivityMessageRenderer<ModelActivity> =
  {
    activityType: MODEL_ACTIVITY,
    content: modelActivitySchema,
    render: ({ content }) => (
      <ModelActivityCard view={modelActivityView(content)} />
    ),
  };
