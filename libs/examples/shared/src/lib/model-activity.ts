import * as z from 'zod';

/** Content of the agent's `soverius.model` activity events (model loading progress). */
export const modelActivitySchema = z.object({
  engineId: z.string(),
  status: z.enum(['loading', 'ready']),
  progress: z.number(),
});

export type ModelActivity = z.infer<typeof modelActivitySchema>;

/** What the example chats show for a model activity. */
export interface ModelActivityView {
  readonly ready: boolean;
  /** 0–100. */
  readonly percent: number;
  /** For example "Loading Qwen3-0.6B-ONNX" or "Qwen3-0.6B-ONNX is ready". */
  readonly title: string;
  /** For example "transformers.js · 42%". */
  readonly detail: string;
}

const engineNames: Readonly<Record<string, string>> = {
  'prompt-api': 'Prompt API',
  'web-llm': 'WebLLM',
  transformers: 'transformers.js',
  demo: 'Demo engine',
};

/** Engine ids look like `web-llm:<model>`, `transformers:<org>/<model>` or `prompt-api`. */
export function modelActivityView(activity: ModelActivity): ModelActivityView {
  const [engine = '', model = ''] = activity.engineId.split(/:(.*)/);
  const engineName = engineNames[engine] ?? engine;
  const name = model.split('/').at(-1) || engineName;
  const ready = activity.status === 'ready';
  const percent = Math.round(activity.progress * 100);
  return {
    ready,
    percent,
    title: ready ? `${name} is ready` : `Loading ${name}`,
    detail: ready
      ? `${engineName} · runs on this device`
      : `${engineName} · ${percent}%`,
  };
}
