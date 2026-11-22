---
title: Devtools
---

# Devtools

```ts
const stop = agent.connectDevtools();
// every event: window.postMessage({ source: 'soverius-ai/devtools', agentId, event }, '/')
stop();
```

No-op without `window` (SSR). `agentId` is `'default'` when the agent has none. The [Playground](/playground)'s "Devtools" switch lists these events; the examples send them in dev mode and with `?devtools`.

| Framework | Devtools                       |
| --------- | ------------------------------ |
| Angular   | `withDevtools()`               |
| React     | `useDevtools(agent, enabled?)` |
| Vue       | `useDevtools(agent, enabled?)` |
