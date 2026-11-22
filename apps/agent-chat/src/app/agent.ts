import { ModelStore } from '@soverius-ai/browser-models';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';
import {
  BrowserModelsAgent,
  SummaryCompaction,
} from '@soverius-ai/browser-models-agui';
import { demoEngine } from '@soverius-ai/example-shared';

// @soverius-ai/browser-models and -agui: an AG-UI agent that chats. No tool calling.

/** 1. The engines. `?context=4096` makes Gemma's context small, to see the compaction at work. */
const context = Number(new URLSearchParams(location.search).get('context'));
const engines = {
  nano: new PromptApiEngine({ sampling: 'balanced' }),
  gemma: new WebLlmEngine('gemma-4-E2B-it-q4f16_1-MLC', {
    contextWindowSize: context || 16384,
  }),
  demo: demoEngine(),
};

export const labels: Readonly<Record<keyof typeof engines, string>> = {
  nano: 'Gemini Nano · Prompt API (built into Chrome)',
  gemma: 'Gemma 4 E2B · WebLLM (WebGPU, ~3.4 GB GPU memory)',
  demo: 'Demo · scripted, no model',
};

/**
 * 2. The agent: an AG-UI `AbstractAgent`. Without `tools` it only chats. Long conversations are
 * compacted to fit the context (this is the default, written out to show it).
 */
export const agent = new BrowserModelsAgent({
  agentId: 'default',
  models: engines,
  defaultModel: 'gemma',
  compaction: new SummaryCompaction({ threshold: 0.9 }),
});

/** 3. Model state for the page: availability, download progress, errors. */
export const store = new ModelStore(agent);

/**
 * Picks the model: `?model=<id>` if given, else the Prompt API when this browser has it, else
 * Gemma. Returns what the Prompt API check said.
 */
export async function pickModel(): Promise<string> {
  const requested = new URLSearchParams(location.search).get('model');
  const nano = await engines.nano.availability();
  if (requested !== null && Object.hasOwn(engines, requested))
    await store.selectModel(requested);
  else if (nano !== 'unavailable') await store.selectModel('nano');
  return nano;
}
