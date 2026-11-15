import { Component, signal } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';
import { injectBrowserModels } from '@soverius-ai/browser-models-angular';
import { context7 } from './app.config';
import { registerDocsExamples } from './copilotkit-docs/register-docs-examples';
import { ModelsPanel } from './models-panel';
import { registerTripPlan } from './trip-plan';
import { modelLabel, statusBadge } from '@soverius-ai/example-shared';

@Component({
  selector: 'app-root',
  imports: [CopilotChat, ModelsPanel],
  templateUrl: './app.html',
})
export class App {
  protected readonly browserModels = injectBrowserModels();
  protected readonly background = signal('');

  constructor() {
    registerDocsExamples(this.background);
    registerTripPlan();
  }

  protected readonly context7 = context7;
  protected readonly label = modelLabel;
  protected readonly badge = statusBadge;

  protected onModelChange(event: Event): void {
    void this.browserModels.selectModel(
      (event.target as HTMLSelectElement).value,
    );
  }
}
