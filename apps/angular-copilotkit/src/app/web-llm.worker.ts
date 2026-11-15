/// <reference lib="webworker" />
import { startWebLlmWorker } from '@soverius-ai/browser-models/web-llm/worker';

// WebLLM runs here, off the main thread, so the page stays responsive while it generates.
startWebLlmWorker();
