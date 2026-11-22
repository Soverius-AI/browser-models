/** Names the docs' code blocks may use without defining them. Keep it short. */

/** The agent of the page: a Prompt API model and a WebLLM model. */
declare const agent: import('@soverius-ai/browser-models-agui').BrowserModelsAgent<{
  nano: import('@soverius-ai/browser-models/prompt-api').PromptApiEngine;
  gemma: import('@soverius-ai/browser-models/web-llm').WebLlmEngine;
}>;

/** The engines for `new BrowserModelsAgent({ models, defaultModel: 'gemma' })`. */
declare const models: {
  nano: import('@soverius-ai/browser-models').Engine;
  gemma: import('@soverius-ai/browser-models').Engine;
};

declare module '*.vue' {
  const component: import('vue').Component;
  export default component;
}

/** examples/docs-assistant.md: the app's index of the docs. */
declare const docs: import('../../docs-assistant/src/app/docs-index.ts').DocsIndex;
