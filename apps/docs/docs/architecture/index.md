---
title: How it works
---

# How it works

The layers in detail: what each package holds and the rules between them. Then: [A run](./run.md) · [Tool calls](./tool-calls.md) · [Context](./context.md) · [Model lifecycle](./model-lifecycle.md)

```mermaid
flowchart TB
  subgraph frameworks["framework bindings"]
    angular["-angular"]
    react["-react"]
    vue["-vue"]
  end
  tools["@soverius-ai/browser-models-tools<br/>ToolCalling · ToolCallRepair · /mcp · /webmcp · /copilotkit"]
  agui["@soverius-ai/browser-models-agui<br/>BrowserModelsAgent · AgentRun · SummaryCompaction · Tools"]
  core["@soverius-ai/browser-models<br/>Engine · EngineKind · Models · ModelStore · OutputParser"]
  engines["/prompt-api · /web-llm · /transformers · /engines"]
  angular --> agui
  react --> agui
  vue --> agui
  frameworks -->|ModelStore| core
  tools -.->|implements Tools| agui
  tools -->|OutputParser| core
  agui --> core
  engines -.->|implement Engine| core
  agui --> aguiLibs["@ag-ui/client · @ag-ui/core · rxjs"]
  tools --> toolLibs["jsonrepair · @cfworker/json-schema"]
  engines --> engineLibs["@mlc-ai/web-llm · @huggingface/transformers<br/>imported on first use"]
```

## Packages

| Layer | Package                             | Contains                                                    | Dependencies                                            | Bundle with the layers below (gzip) |
| ----- | ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------- |
| 1     | `@soverius-ai/browser-models`       | `Engine`, three engines, `Models`, `ModelStore`, parser     | none; engine libraries are optional peers               | 2.1–5.1 KB                          |
| 2     | `@soverius-ai/browser-models-agui`  | `BrowserModelsAgent`, `AgentRun`, compaction, `AgentEvents` | peers: `@ag-ui/client`, `@ag-ui/core` 1.x, `rxjs` 7     | 6.9 KB                              |
| 3     | `@soverius-ai/browser-models-tools` | `ToolCalling`, repair, schema checks, MCP, WebMCP, gen. UI  | `jsonrepair`, `@cfworker/json-schema`; peers as layer 2 | 20.2 KB                             |
| –     | `-angular`, `-react`, `-vue`        | model state and devtools for the framework                  | the framework                                           | –                                   |

Sizes: the published packages bundled with esbuild, minified and gzipped, AG-UI not counted (CopilotKit brings it; bundled it adds about 76 KB). Layer 1: the Prompt API engine and `ModelStore` (2.1 KB) up to all three engines (5.1 KB); layers 2 and 3 with the Prompt API engine. `/mcp` adds 1.4 KB, `/copilotkit` 0.9 KB, `/webmcp` 0.3 KB. AG-UI and `rxjs` are peers, so the agent uses the app's copy, the one CopilotKit brings ([npm note](../agent/index.md)). The packages ship minified (esbuild); their type declarations keep the doc comments.

## Rules

| Rule                                                             | Why                                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| a layer imports only the layers below it                         | Nx tags `type:core` ← `type:agent` ← `type:tools`, checked by lint                                                      |
| the core needs no engine library                                 | a plain chat stays small                                                                                                |
| each engine has its own entry point                              | an app installs only the engine libraries it uses; Vite fails on missing ones                                           |
| engine libraries are imported on first use                       | WebLLM and transformers.js are not in the initial bundle; WebLLM runs in the package's worker                           |
| the app picks the model; nothing falls back                      | `availability()` tells, the app decides ([Choose an engine](../engines/index.md))                                       |
| tool calling and compaction are plug-ins (`tools`, `compaction`) | replace them with your own: [Custom Tools](../tools/custom.md), [Compaction](../agent/compaction.md#your-own-algorithm) |
| all packages share one version                                   | released together; peers are pinned to that version                                                                     |

## Repository

```text
libs/agent/browser-models        layer 1
libs/agent/browser-models-agui   layer 2
libs/agent/browser-models-tools  layer 3
libs/frameworks/*                Angular, React, Vue
libs/examples/shared             private: demo engine, model list, example tools
libs/examples/snippets           private: the code on the front page and in the docs, tested
apps/engine-chat                 example: layer 1
apps/agent-chat                  example: layers 1–2
apps/*-copilotkit, vanilla-agui  examples: all layers
apps/docs-assistant              example: these docs, asked by a model in your browser
apps/docs                        this site
```
