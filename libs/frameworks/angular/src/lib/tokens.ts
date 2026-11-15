import { InjectionToken } from '@angular/core';
import type { BrowserModelsAgent } from '@soverius-ai/browser-models/agent';

/** The agent the application uses, registered with `withAgent()`. */
export const BROWSER_MODELS_AGENT: InjectionToken<BrowserModelsAgent> =
  new InjectionToken<BrowserModelsAgent>('BROWSER_MODELS_AGENT');
