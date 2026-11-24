import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import {
  ToolCallingAgent,
  type LocalTool,
} from '@soverius-ai/browser-models-tools';

// Layer 2: tool calling on the engine, no AG-UI. ToolCallingAgent runs the tool and keeps the chat.
const currentTime: LocalTool = {
  name: 'currentTime',
  description: 'Returns the current local time.',
  parameters: { type: 'object', properties: {} },
  execute: async () => new Date().toLocaleTimeString(),
};

const agent = new ToolCallingAgent({
  engine: new PromptApiEngine(),
  localTools: [currentTime],
});
const output = document.body.appendChild(document.createElement('p'));

for await (const part of agent.run('What time is it?')) {
  if (part.type === 'tool-call') output.append(`[${part.call.name}] `);
  if (part.type === 'text') output.append(part.text);
}
