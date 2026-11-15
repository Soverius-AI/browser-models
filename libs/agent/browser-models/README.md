# @soverius-ai/browser-models

Run language models in the browser (Chrome/Edge Prompt API, WebLLM, transformers.js) as [AG-UI](https://docs.ag-ui.com) agents. CopilotKit or any AG-UI client works unchanged.

```bash
pnpm add @soverius-ai/browser-models
pnpm add @mlc-ai/web-llm            # only for WebLlmEngine
pnpm add @huggingface/transformers  # only for TransformersJsEngine
```

```ts
import { BrowserModelsAgent } from '@soverius-ai/browser-models/agent';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
});
```

Entries: `.`, `/agent`, `/prompt-api`, `/web-llm`, `/web-llm/worker`, `/transformers`, `/webmcp`, `/mcp`, `/copilotkit` ([Packages](https://browser-models.soverius.ai/docs#packages)).
Framework packages: `@soverius-ai/browser-models-angular`, `@soverius-ai/browser-models-react`, `@soverius-ai/browser-models-vue`.

[Docs](https://browser-models.soverius.ai/docs) · [Playground](https://browser-models.soverius.ai/playground) · by [Soverius AI](https://soverius.ai) · MIT
