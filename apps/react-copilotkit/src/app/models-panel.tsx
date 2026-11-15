import { useModelStore } from '@soverius-ai/browser-models-react';
import {
  gigabytes,
  modelLabel,
  statusBadge,
  statusText,
} from '@soverius-ai/example-shared';
import { models } from './agent';

/** Shows which models are on this device, how much storage they use, and deletes downloads. */
export function ModelsPanel() {
  const state = useModelStore(models);

  return (
    <details
      className="collapse-arrow collapse border border-base-300 bg-base-200"
      // Checking every model loads the WebLLM and transformers.js libraries, so only do it on open.
      onToggle={(event) =>
        event.currentTarget.open && void models.refreshModels()
      }
    >
      <summary className="collapse-title min-h-0 py-2 text-sm font-medium">
        Models on this device
      </summary>
      <div className="collapse-content text-sm">
        <table className="table table-sm">
          <tbody>
            {state.models.map((model) => (
              <tr key={model.id} data-model={model.id}>
                <td>{modelLabel(model.id)}</td>
                <td>
                  <span
                    className={`badge badge-soft badge-sm ${statusBadge(model.availability)}`}
                  >
                    {statusText(model.availability, model.canDelete)}
                  </span>
                </td>
                <td className="text-right">
                  {model.canDelete && model.availability === 'available' && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => void models.deleteModel(model.id)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {state.storage && (
          <p data-testid="storage" className="mt-2 opacity-70">
            Browser storage used by this site: {gigabytes(state.storage.usage)}{' '}
            of {gigabytes(state.storage.quota)}
          </p>
        )}
      </div>
    </details>
  );
}
