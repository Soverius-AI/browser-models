---
title: Custom engine
---

# Custom engine

Any object with the `Engine` interface works everywhere an engine does: `Models`, `ModelStore`, the agent.

```ts
import type { Engine } from '@soverius-ai/browser-models';

const echo: Engine = {
  id: 'echo',
  supportsConstraint: false,
  availability: async () => 'available',
  load: async () => undefined,
  unload: async () => undefined,
  async *generate({ messages }) {
    yield { type: 'text', text: messages.at(-1)?.content ?? '' };
    yield { type: 'finish', reason: 'stop' };
  },
};
```

| Member                                       | Purpose                                                      |
| -------------------------------------------- | ------------------------------------------------------------ |
| `id`                                         | stable id, shown as `engineId` in the model state            |
| `kind`                                       | optional: set by the engines of this library                 |
| `supportsConstraint`                         | `generate()` can force JSON Schema output with `constraint`  |
| `contextWindowSize`                          | optional: tokens the context holds, for the compaction       |
| `availability()`                             | `available` · `downloadable` · `downloading` · `unavailable` |
| `load({ onProgress, signal })`               | download and load                                            |
| `generate({ messages, constraint, signal })` | `text` parts, then `finish`; throws when `signal` aborts     |
| `unload()`                                   | free memory, GPU buffers, worker; stop a load in progress    |
| `delete()`                                   | optional: unload, then remove the download                   |

`AsyncQueue` (core) turns a callback API into the async stream `generate()` returns; `untilAborted` lets one caller stop waiting for a shared load.

API: [Engine](../api/browser-models/core.md#engine)
