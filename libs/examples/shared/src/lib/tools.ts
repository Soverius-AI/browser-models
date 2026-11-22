import type { LocalTool } from '@soverius-ai/browser-models-tools';

/** A local tool: it runs in the browser and its result goes back to the model. */
export const currentTime: LocalTool<Record<string, never>> = {
  name: 'currentTime',
  description: 'Returns the current local time.',
  parameters: { type: 'object', properties: {} },
  execute: async () => new Date().toLocaleTimeString('en-GB'),
};
