import type { Availability } from '@soverius-ai/browser-models';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { TransformersJsEngine } from '@soverius-ai/browser-models/transformers';
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';
import { demoEngine } from './demo-engine';

/**
 * The models every example offers. The user picks one; nothing is chosen automatically.
 * WebLLM runs in the package's own worker.
 */
export function createExampleModels() {
  // WebLLM models default to 4096 tokens. Tool descriptions, a generated page or documentation
  // from an MCP server need more. `?context=4096` makes it small, to see compaction at work.
  const context = Number(new URLSearchParams(location.search).get('context'));
  const webLlm = { contextWindowSize: context || 16384 };
  return {
    nano: new PromptApiEngine(),
    qwenWebLlm: new WebLlmEngine('Qwen3-0.6B-q4f16_1-MLC', webLlm),
    qwenTransformers: new TransformersJsEngine(
      'onnx-community/Qwen3-0.6B-ONNX',
      {
        storage: 'opfs',
      },
    ),
    gemmaWebLlm: new WebLlmEngine('gemma-4-E2B-it-q4f16_1-MLC', webLlm),
    gemmaTransformers: new TransformersJsEngine(
      'onnx-community/gemma-4-E4B-it-ONNX',
      {
        task: 'image-text-to-text',
        storage: 'opfs',
      },
    ),
    demo: demoEngine(),
  };
}

export type ModelId = keyof ReturnType<typeof createExampleModels>;

export const modelLabels: Readonly<Record<ModelId, string>> = {
  nano: 'Gemini Nano · Prompt API (built into Chrome)',
  qwenWebLlm: 'Qwen3 0.6B · WebLLM (WebGPU, ~0.5 GB)',
  qwenTransformers: 'Qwen3 0.6B · transformers.js (WebGPU, ~0.6 GB)',
  gemmaWebLlm: 'Gemma 4 E2B · WebLLM (WebGPU, ~3.4 GB GPU memory)',
  gemmaTransformers: 'Gemma 4 E4B · transformers.js (WebGPU, ~5 GB)',
  demo: 'Demo · scripted, no model',
};

/** The label of a model id, or the id itself for an unknown one. */
export function modelLabel(modelId: string): string {
  return Object.hasOwn(modelLabels, modelId)
    ? modelLabels[modelId as ModelId]
    : modelId;
}

/** `?model=<id>` preselects a model, for example `?model=demo` in the e2e tests. */
export function modelFromUrl(): ModelId {
  const id = new URLSearchParams(location.search).get('model');
  return id !== null && Object.hasOwn(modelLabels, id)
    ? (id as ModelId)
    : 'nano';
}

/** The text the "Models on this device" panels show for a model. */
export function statusText(
  availability: Availability,
  canDelete: boolean,
): string {
  switch (availability) {
    case 'available':
      return canDelete ? 'Downloaded' : 'Ready';
    case 'downloading':
      return 'Downloading…';
    case 'downloadable':
      return 'Not downloaded';
    case 'unavailable':
      return 'Not supported in this browser';
  }
}

/** The daisyUI badge colour for an availability. */
export function statusBadge(availability: Availability | 'checking'): string {
  return {
    checking: 'badge-neutral',
    available: 'badge-success',
    downloading: 'badge-info',
    downloadable: 'badge-warning',
    unavailable: 'badge-error',
  }[availability];
}

/** Bytes as gigabytes with two decimals, for the storage line. */
export function gigabytes(bytes: number): string {
  return `${(bytes / 1e9).toFixed(2)} GB`;
}
