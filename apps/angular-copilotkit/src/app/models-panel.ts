import { Component } from '@angular/core';
import { injectBrowserModels } from '@soverius-ai/browser-models-angular';
import {
  gigabytes,
  modelLabel,
  statusBadge,
  statusText,
} from '@soverius-ai/example-shared';

/** Shows which models are on this device, how much storage they use, and deletes downloads. */
@Component({
  selector: 'app-models-panel',
  template: `
    <details
      class="collapse-arrow collapse border border-base-300 bg-base-200"
      (toggle)="onToggle($event)"
    >
      <summary class="collapse-title min-h-0 py-2 text-sm font-medium">
        Models on this device
      </summary>
      <div class="collapse-content text-sm">
        <table class="table table-sm">
          <tbody>
            @for (model of browserModels.models(); track model.id) {
              <tr [attr.data-model]="model.id">
                <td>{{ label(model.id) }}</td>
                <td>
                  <span
                    class="badge badge-soft badge-sm"
                    [class]="badge(model.availability)"
                  >
                    {{ status(model.availability, model.canDelete) }}
                  </span>
                </td>
                <td class="text-right">
                  @if (model.canDelete && model.availability === 'available') {
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs text-error"
                      (click)="browserModels.deleteModel(model.id)"
                    >
                      Delete
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>

        @if (browserModels.storage(); as storage) {
          <p data-testid="storage" class="mt-2 opacity-70">
            Browser storage used by this site: {{ gigabytes(storage.usage) }} of
            {{ gigabytes(storage.quota) }}
          </p>
        }
      </div>
    </details>
  `,
})
export class ModelsPanel {
  protected readonly browserModels = injectBrowserModels();

  protected onToggle(event: Event): void {
    // Checking every model loads the WebLLM and transformers.js libraries, so only do it on open.
    if ((event.target as HTMLDetailsElement).open)
      void this.browserModels.refreshModels();
  }

  protected readonly label = modelLabel;
  protected readonly status = statusText;
  protected readonly badge = statusBadge;
  protected readonly gigabytes = gigabytes;
}
