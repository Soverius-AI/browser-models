---
title: Model state
---

# Model state

`ModelStore` is framework-neutral. [Angular](./angular.md), [React](./react.md) and [Vue](./vue.md) wrap it.

```ts
import { ModelStore } from '@soverius-ai/browser-models/agent';

const models = new ModelStore(agent);
const stop = models.subscribe(() => render(models.getState()));
```

The selected model is checked when the store is created. States: [Architecture → Model state](./architecture.md#model-state).

## State

`getState()` returns a new object after every change.

| Field           | Type                                          |
| --------------- | --------------------------------------------- |
| `selectedModel` | `string`                                      |
| `availability`  | `Availability \| 'checking'`                  |
| `progress`      | `number \| undefined` (0–1)                   |
| `error`         | `string \| undefined`                         |
| `models`        | `{ id, engineId, availability, canDelete }[]` |
| `storage`       | `{ usage, quota } \| undefined` (bytes)       |

## Members

| Member                | Does                                                      |
| --------------------- | --------------------------------------------------------- |
| `agent`, `modelIds`   | the agent and its model ids                               |
| `getState()`          | current state                                             |
| `subscribe(listener)` | call `listener` on every change; returns a stop function  |
| `selectModel(id)`     | switch model, unload the previous one, check again        |
| `refresh()`           | check the selected model                                  |
| `download()`          | `engine.load()` with progress; call it from a click       |
| `refreshModels()`     | check all models and storage (loads the engine libraries) |
| `deleteModel(id)`     | `engine.delete()`                                         |

A failing check counts as `unavailable` and sets `error`.
