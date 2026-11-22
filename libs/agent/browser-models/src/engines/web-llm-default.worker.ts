/**
 * The worker `WebLlmEngine` starts by default: WebLLM runs here, off the page's main thread.
 */
import { startWebLlmWorker } from './web-llm-worker.ts';

startWebLlmWorker();
