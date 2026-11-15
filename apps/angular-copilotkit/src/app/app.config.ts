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
import { OpenGenerativeUi } from '@soverius-ai/browser-models/copilotkit';
import { WebMcpTools } from '@soverius-ai/browser-models/webmcp';
import { MODEL_ACTIVITY } from '@soverius-ai/browser-models';
import { BrowserModelsAgent } from '@soverius-ai/browser-models/agent';
import { ModelActivityView } from './model-activity';
import {
  Context7Tools,
  sandboxDesignSkill,
  createExampleModels,
  currentTime,
  devtoolsFromUrl,
  modelActivitySchema,
  modelFromUrl,
} from '@soverius-ai/example-shared';

/** Context7 library docs over remote MCP. Off unless the page is opened with `?mcp=context7`. */
export const context7 = new Context7Tools();

const agent = new BrowserModelsAgent({
  agentId: 'default',
  models: createExampleModels(
    () =>
      new Worker(new URL('./web-llm.worker', import.meta.url), {
        type: 'module',
      }),
  ),
  defaultModel: modelFromUrl(),
  localTools: [currentTime, new WebMcpTools(), context7],
});

// Open Generative UI: reports the streamed `generateSandboxedUi` tool call as the activity
// messages CopilotKit renders in a sandboxed iframe (see OpenGenerativeUi).
agent.use(new OpenGenerativeUi());

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
