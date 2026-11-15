import { OpenGenerativeUi } from '@soverius-ai/browser-models/copilotkit';
import { WebMcpTools } from '@soverius-ai/browser-models/webmcp';
import {
  BrowserModelsAgent,
  ModelStore,
} from '@soverius-ai/browser-models/agent';
import {
  Context7Tools,
  createExampleModels,
  currentTime,
  modelFromUrl,
} from '@soverius-ai/example-shared';

/** Context7 library docs over remote MCP. Off unless the page is opened with `?mcp=context7`. */
export const context7 = new Context7Tools();

/** The in-browser agent. CopilotKit talks to it like to any AG-UI agent. */
export const agent = new BrowserModelsAgent({
  agentId: 'default',
  models: createExampleModels(
    () =>
      new Worker(new URL('./web-llm.worker.ts', import.meta.url), {
        type: 'module',
      }),
  ),
  defaultModel: modelFromUrl(),
  localTools: [currentTime, new WebMcpTools(), context7],
});

// Open Generative UI: reports the streamed `generateSandboxedUi` tool call as the activity
// messages CopilotKit renders in a sandboxed iframe (see OpenGenerativeUi).
agent.use(new OpenGenerativeUi());

/** Model state (availability, downloads, storage) for the UI. */
export const models = new ModelStore(agent);
