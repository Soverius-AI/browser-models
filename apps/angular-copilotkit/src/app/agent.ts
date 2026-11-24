import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling } from '@soverius-ai/browser-models-tools';
import {
  OpenGenerativeUi,
  SandboxedUiCheck,
} from '@soverius-ai/browser-models-tools/copilotkit';
import { WebMcpTools } from '@soverius-ai/browser-models-tools/webmcp';
import {
  Context7Tools,
  createExampleModels,
  currentTime,
  modelFromUrl,
} from '@soverius-ai/example-shared';

// 1. Engines (@soverius-ai/browser-models): the models the user can pick. The list is shared by
//    the examples, see libs/examples/shared/src/lib/models.ts.
const engines = createExampleModels();

// 2. Tool calling (@soverius-ai/browser-models-tools): a tool of the agent, the page's WebMCP
//    tools, and Context7 over MCP (off unless the page is opened with `?mcp=context7`). The
//    tools CopilotKit registers in the page come with every run by themselves.
export const context7 = new Context7Tools();
const tools = new ToolCalling({
  localTools: [currentTime, new WebMcpTools(), context7],
  // A generated page whose script looks for elements the page lacks goes back to the model.
  checks: [new SandboxedUiCheck()],
});

// 3. Agent (@soverius-ai/browser-models-agui): CopilotKit talks to it like to any AG-UI agent.
export const agent = new BrowserModelsAgent({
  agentId: 'default',
  models: engines,
  defaultModel: modelFromUrl(),
  tools,
});
// Open Generative UI: reports the streamed `generateSandboxedUi` tool call as the activity
// messages CopilotKit renders in a sandboxed iframe.
agent.use(new OpenGenerativeUi());

// 4. Model state: `provideBrowserModels(withAgent(agent))` in app.config.ts turns it into signals.
