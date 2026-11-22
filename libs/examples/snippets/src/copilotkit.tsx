import {
  CopilotChat,
  CopilotKitProvider,
  useFrontendTool,
} from '@copilotkit/react-core/v2';
import '@copilotkit/react-core/v2/styles.css';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { ToolCalling } from '@soverius-ai/browser-models-tools';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';

// CopilotKit, unmodified: it talks AG-UI, the agent runs the model in the browser.
const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
  tools: new ToolCalling(),
});

// A frontend tool: the model calls it, it runs in the page.
function Background() {
  useFrontendTool(
    {
      name: 'setBackground',
      description: 'Sets the background color of the page.',
      parameters: z.object({ color: z.string() }),
      handler: async ({ color }) => {
        document.body.style.background = color;
        return `The background is ${color}.`;
      },
    },
    [],
  );
  return null;
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <CopilotKitProvider agents__unsafe_dev_only={{ default: agent }}>
    <Background />
    <CopilotChat />
  </CopilotKitProvider>,
);
