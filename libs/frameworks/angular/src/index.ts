/**
 * `@soverius-ai/browser-models-angular`: `provideBrowserModels()`, model state as signals, devtools.
 *
 * @packageDocumentation
 */
export {
  BrowserModels,
  injectBrowserModels,
  type ModelStatus,
  type StorageUse,
} from './lib/browser-models.ts';
export {
  provideBrowserModels,
  withAgent,
  withDevtools,
  type BrowserModelsFeature,
} from './lib/provide-browser-models.ts';
export { BROWSER_MODELS_AGENT } from './lib/tokens.ts';
