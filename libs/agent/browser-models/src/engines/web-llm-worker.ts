import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

/**
 * Starts WebLLM inside a Web Worker. Use it as the whole worker file:
 *
 * ```ts
 * // web-llm.worker.ts
 * import { startWebLlmWorker } from '@soverius-ai/browser-models/web-llm/worker';
 * startWebLlmWorker();
 * ```
 */
export function startWebLlmWorker(): void {
  const handler = new WebWorkerMLCEngineHandler();
  self.onmessage = (message: MessageEvent) => handler.onmessage(message);
}
