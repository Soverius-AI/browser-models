---
title: Model picker & downloads
---

# Model picker & downloads

`Models` holds engines by id and the selected one. `ModelStore` adds availability, download progress, errors, the downloaded models and storage, for a UI. Both are framework-neutral; [Angular](../frameworks/angular.md), [React](../frameworks/react.md) and [Vue](../frameworks/vue.md) wrap the store.

```ts
import { Models, ModelStore } from '@soverius-ai/browser-models';
import { PromptApiEngine } from '@soverius-ai/browser-models/prompt-api';
import { WebLlmEngine } from '@soverius-ai/browser-models/web-llm';

const models = new Models(
  {
    nano: new PromptApiEngine(),
    gemma: new WebLlmEngine('gemma-4-E2B-it-q4f16_1-MLC'),
  },
  'gemma',
);
const store = new ModelStore(models);

const status = document.body.appendChild(document.createElement('p'));
const download = document.body.appendChild(document.createElement('button'));
download.textContent = 'Download';

store.subscribe(() => {
  const { availability, progress } = store.getState();
  status.textContent = `${availability} ${Math.round((progress ?? 0) * 100)} %`;
});
download.onclick = () => store.download(); // from a click: browsers may need a user gesture
await store.selectModel('nano');
models.engine(); // the selected engine
```

In layer 3 the agent is the model source: `new ModelStore(agent)`.

## State

`getState()` returns a new object after every change. States: [Model lifecycle](../architecture/model-lifecycle.md).

| Field           | Type                                          |
| --------------- | --------------------------------------------- |
| `selectedModel` | `string`                                      |
| `availability`  | `Availability \| 'checking'`                  |
| `progress`      | `number \| undefined` (0–1)                   |
| `error`         | `string \| undefined`                         |
| `models`        | `{ id, engineId, availability, canDelete }[]` |
| `storage`       | `{ usage, quota } \| undefined` (bytes)       |

## ModelStore

| Member                | Does                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `getState()`          | the current state                                                                                                 |
| `subscribe(listener)` | call `listener` on every change; returns a stop function                                                          |
| `agent`, `modelIds`   | the model source and its ids                                                                                      |
| `selectModel(id)`     | switch model, unload the previous one, check again                                                                |
| `refresh()`           | check the selected model                                                                                          |
| `download()`          | `engine.load()` with progress, then `refresh()`; `refreshModels()` if the list was loaded; a failure sets `error` |
| `refreshModels()`     | check all models and storage (loads the engine libraries)                                                         |
| `deleteModel(id)`     | `engine.delete()`                                                                                                 |

A failing check counts as `unavailable` and sets `error`. The selected model is checked when the store is created.

## Models

| Member                      | Does                               |
| --------------------------- | ---------------------------------- |
| `modelIds`, `selectedModel` | ids, typed from the engines object |
| `selectModel(id)`           | only registered ids; others throw  |
| `has(id)`                   | for ids from outside, like a URL   |
| `engine(id?)`               | the engine, typed per id           |

API: [ModelStore](../api/browser-models/core.md#modelstore), [Models](../api/browser-models/core.md#models)
