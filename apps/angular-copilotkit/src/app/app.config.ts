import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideCopilotKit } from '@copilotkit/angular';
import {
  provideBrowserModels,
  withAgent,
  withDevtools,
} from '@soverius-ai/browser-models-angular';
import { MODEL_ACTIVITY } from '@soverius-ai/browser-models-agui';
import {
  devtoolsFromUrl,
  modelActivitySchema,
  sandboxDesignSkill,
} from '@soverius-ai/example-shared';
import { agent } from './agent';
import { ModelActivityView } from './model-activity';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideBrowserModels(
      withAgent(agent),
      ...(isDevMode() || devtoolsFromUrl() ? [withDevtools()] : []),
    ),
    provideCopilotKit({
      agents: { default: agent },
      // Registers the `generateSandboxedUi` tool and the sandbox renderer (JetBrains websandbox).
      openGenerativeUI: { designSkill: sandboxDesignSkill },
      renderActivityMessages: [
        {
          activityType: MODEL_ACTIVITY,
          content: modelActivitySchema,
          component: ModelActivityView,
        },
      ],
    }),
  ],
};
