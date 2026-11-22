# @soverius-ai/browser-models-agui

An [AG-UI](https://docs.ag-ui.com) agent on the engines of `@soverius-ai/browser-models`. CopilotKit or any AG-UI client works unchanged.

```bash
pnpm add @soverius-ai/browser-models @soverius-ai/browser-models-agui
```

```ts
import { BrowserModelsAgent } from '@soverius-ai/browser-models-agui';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';

const agent = new BrowserModelsAgent({
  models: { nano: new PromptApiEngine() },
  defaultModel: 'nano',
});
```

Chat only: add `@soverius-ai/browser-models-tools` for tool calls. Long conversations are compacted to fit the context (`SummaryCompaction`, or your own `Compaction`).

[Docs](https://browser-models.soverius.ai/docs) · [Playground](https://browser-models.soverius.ai/playground) · by [Soverius AI](https://soverius.ai) · MIT
