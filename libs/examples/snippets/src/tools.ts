import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling, type LocalTool } from '@soverius-ai/browser-models-tools';

// Layer 3 with layer 2: the AG-UI agent with tool calling. It runs the tool, the model answers.
const currentTime: LocalTool = {
  name: 'currentTime',
  description: 'Returns the current local time.',
  parameters: { type: 'object', properties: {} },
  execute: async () => new Date().toLocaleTimeString(),
};

const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
  tools: new ToolCalling({ localTools: [currentTime] }),
});
const output = document.body.appendChild(document.createElement('p'));

agent.addMessage({
  id: crypto.randomUUID(),
  role: 'user',
  content: 'What time is it?',
});
await agent.runAgent(
  {},
  {
    onToolCallStartEvent: ({ event }) =>
      void output.append(`[${event.toolCallName}] `),
    onTextMessageContentEvent: ({ event }) => void output.append(event.delta),
  },
);
