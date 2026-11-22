import { Models, ModelStore } from '@soverius-ai/browser-models';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { TransformersJsEngine } from '@soverius-ai/browser-models/transformers';
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';
import { demoEngine } from '@soverius-ai/example-shared';

// Only @soverius-ai/browser-models: no AG-UI, no agent, no tool calling.

/** The engines: one interface over three libraries. The settings mean the same for each. */
export const engines = {
  nano: new PromptApiEngine({ languages: ['en'], sampling: 'balanced' }),
  gemma: new WebLlmEngine('gemma-4-E2B-it-q4f16_1-MLC', {
    contextWindowSize: 16384,
    sampling: 'balanced',
    // WebLLM runs in a worker, so the page stays responsive while it writes.
    worker: () =>
      new Worker(new URL('./web-llm.worker.ts', import.meta.url), {
        type: 'module',
      }),
  }),
  qwen: new TransformersJsEngine('onnx-community/Qwen3-0.6B-ONNX', {
    maxOutputTokens: 1024,
    sampling: 'balanced',
    storage: 'opfs',
  }),
  demo: demoEngine(),
};

export type EngineId = keyof typeof engines;

export const labels: Readonly<Record<EngineId, string>> = {
  nano: 'Gemini Nano · Prompt API (built into Chrome)',
  gemma: 'Gemma 4 E2B · WebLLM (WebGPU, ~3.4 GB GPU memory)',
  qwen: 'Qwen3 0.6B · transformers.js (WebGPU, ~0.6 GB)',
  demo: 'Demo · scripted, no model',
};

/** The engines by id, and the one in use. */
export const models = new Models(engines, 'gemma');

/** Availability, download progress and errors of the selected engine, for the page. */
export const store = new ModelStore(models);

/**
 * Picks the engine: `?model=<id>` if given, else the Prompt API when this browser has it, else
 * Gemma on WebLLM. Nothing switches by itself later. Returns what the Prompt API check said.
 */
export async function pickEngine(): Promise<string> {
  const requested = new URLSearchParams(location.search).get('model');
  const nano = await engines.nano.availability();
  if (requested !== null && models.has(requested))
    await store.selectModel(requested);
  else if (nano !== 'unavailable') await store.selectModel('nano');
  return nano;
}
