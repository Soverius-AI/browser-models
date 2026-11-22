import { ModelStore } from '@soverius-ai/browser-models';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling } from '@soverius-ai/browser-models-tools';
import { McpTools } from '@soverius-ai/browser-models-tools/mcp';
import { WebMcpTools } from '@soverius-ai/browser-models-tools/webmcp';
import {
  Context7Tools,
  createExampleModels,
  currentTime,
  modelFromUrl,
} from '@soverius-ai/example-shared';

// 1. Engines (@soverius-ai/browser-models): the models the user can pick. The list is shared by
//    the examples, see libs/examples/shared/src/lib/models.ts.
const engines = createExampleModels(
  () =>
    new Worker(new URL('./web-llm.worker.ts', import.meta.url), {
      type: 'module',
    }),
);

// 2. Tool calling (@soverius-ai/browser-models-tools). The page's own frontend tool comes with
//    every run, see chat.ts.
/** Context7 library docs over remote MCP. Off until the user switches it on (or `?mcp=context7`). */
export const context7 = new Context7Tools();
const tools = new ToolCalling({
  localTools: [
    currentTime, // runs in the agent
    new WebMcpTools(), // the page's WebMCP tools
    new McpTools({ url: '/mcp', namespace: 'demo' }), // the demo MCP server (see mcp-server.ts)
    context7,
  ],
});

// 3. Agent (@soverius-ai/browser-models-agui): an AG-UI `AbstractAgent`.
export const agent = new BrowserModelsAgent({
  agentId: 'default',
  models: engines,
  defaultModel: modelFromUrl(),
  tools,
});

// 4. Model state (@soverius-ai/browser-models): availability and downloads, for the picker.
export const models = new ModelStore(agent);
