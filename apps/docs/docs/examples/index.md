---
title: Examples
---

# Examples

One app per layer, then the full stack. All run with `?model=demo` (a scripted engine, no download) and have e2e tests.

| App                       | Layers | Port | Stack                      | Shows                                                                                   | Playground                                       |
| ------------------------- | ------ | ---- | -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `apps/engine-chat`        | 1      | 4204 | plain TypeScript           | Prompt API check, model picker, streamed parts, thinking, token counts, stop            | [Engine only](/playground?platform=engine)       |
| `apps/agent-chat`         | 1–2    | 4205 | `@ag-ui/client`, no tools  | thinking, model loading and compaction events, stop                                     | [Agent](/playground?platform=agent)              |
| `apps/vanilla-agui`       | 1–3    | 4203 | `@ag-ui/client`            | frontend tool, local tool, WebMCP, demo MCP server, Context7                            | [Vanilla](/playground?platform=vanilla)          |
| `apps/angular-copilotkit` | 1–3    | 4200 | Angular 22, CopilotKit 0.6 | CopilotKit docs examples, streaming tool UI, Open Generative UI                         | [Angular](/playground?platform=angular)          |
| `apps/react-copilotkit`   | 1–3    | 4201 | React 19, CopilotKit 1.88  | the same in React                                                                       | [React](/playground?platform=react)              |
| `apps/vue-copilotkit`     | 1–3    | 4202 | Vue 3, CopilotKit 1.88     | the same in Vue                                                                         | [Vue](/playground?platform=vue)                  |
| `apps/docs-assistant`     | 1–3    | 4206 | React 19, CopilotKit 1.88  | these docs, searched by a model in your browser: [how it is built](./docs-assistant.md) | [Docs assistant](/playground?platform=assistant) |

```bash
pnpm install
pnpm nx run engine-chat:serve      # http://localhost:4204
pnpm nx run docs-assistant:serve   # http://localhost:4206
pnpm nx run-many -t e2e            # all examples, with the demo engine
```

| Demo prompt                     | App             | What happens                                    |
| ------------------------------- | --------------- | ----------------------------------------------- |
| `think about it`                | engine, agent   | thinking shown apart from the answer            |
| `What time is it?`              | tool apps       | local tool                                      |
| `What is the page title?`       | tool apps       | WebMCP page tool                                |
| `Plan a trip to Vienna`         | CopilotKit apps | a card that fills in while the arguments stream |
| `Draw a chart with Chart.js`    | CopilotKit apps | Open Generative UI                              |
| `how do I check the Prompt API` | docs assistant  | `searchDocs`, an answer, a card for the page    |
