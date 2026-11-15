import {
  BrowserModelsAgent,
  ModelStore,
} from '@soverius-ai/browser-models/agent';
import { McpTools } from '@soverius-ai/browser-models/mcp';
import { WebMcpTools } from '@soverius-ai/browser-models/webmcp';
import {
  Context7Tools,
  createExampleModels,
  currentTime,
  modelFromUrl,
} from '@soverius-ai/example-shared';

/** Context7 library docs over remote MCP. Off until the user switches it on (or `?mcp=context7`). */
export const context7 = new Context7Tools();

/** The in-browser agent: an AG-UI `AbstractAgent`. */
export const agent = new BrowserModelsAgent({
  agentId: 'default',
  models: createExampleModels(
    () =>
      new Worker(new URL('./web-llm.worker.ts', import.meta.url), {
        type: 'module',
      }),
  ),
  defaultModel: modelFromUrl(),
  localTools: [
    currentTime, // runs in the agent
    new WebMcpTools(), // the page's WebMCP tools
    new McpTools({ url: '/mcp', namespace: 'demo' }), // the demo MCP server (see mcp-server.ts)
    context7,
  ],
});

/** Model state (availability, downloads) for the picker. */
export const models = new ModelStore(agent);
