import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';

// Layer 3: an AG-UI agent on the engine. Any AG-UI client runs it; here its own runAgent.
const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
});
const output = document.body.appendChild(document.createElement('p'));

agent.addMessage({
  id: crypto.randomUUID(),
  role: 'user',
  content: 'Explain AG-UI in one sentence.',
});
await agent.runAgent(
  {},
  { onTextMessageContentEvent: ({ event }) => void output.append(event.delta) },
);
