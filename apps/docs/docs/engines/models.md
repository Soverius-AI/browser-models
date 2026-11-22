---
title: Model picker & downloads
---

# Model picker & downloads

`Models` holds engines by id and the selected one. `ModelStore` adds availability, download progress, errors, the downloaded models and storage, for a UI. Both are framework-neutral; [Angular](../frameworks/angular.md), [React](../frameworks/react.md) and [Vue](../frameworks/vue.md) wrap the store. `BrowserModelsAgent` is a model source too.

```ts
import { Models, ModelStore } from '@soverius-ai/browser-models';

const models = new Models({ nano, gemma }, 'gemma'); // or the agent
const store = new ModelStore(models);

store.subscribe(() => render(store.getState()));
button.onclick = () => store.download(); // from a click: browsers may need a user gesture
await store.selectModel('nano');
models.engine(); // the selected engine
```

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

| Member                | Does                                                      |
| --------------------- | --------------------------------------------------------- |
| `subscribe(listener)` | call `listener` on every change; returns a stop function  |
| `selectModel(id)`     | switch model, unload the previous one, check again        |
| `refresh()`           | check the selected model                                  |
| `download()`          | `engine.load()` with progress                             |
| `refreshModels()`     | check all models and storage (loads the engine libraries) |
| `deleteModel(id)`     | `engine.delete()`                                         |

A failing check counts as `unavailable` and sets `error`. The selected model is checked when the store is created.

## Models

| Member                      | Does                               |
| --------------------------- | ---------------------------------- |
| `modelIds`, `selectedModel` | ids, typed from the engines object |
| `selectModel(id)`           | only registered ids; others throw  |
| `has(id)`                   | for ids from outside, like a URL   |
| `engine(id?)`               | the engine, typed per id           |

API: [ModelStore](../api/browser-models/core.md#modelstore), [Models](../api/browser-models/core.md#models)
