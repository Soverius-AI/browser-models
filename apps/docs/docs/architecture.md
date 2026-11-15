---
title: Architecture
---

# Architecture

## Packages

```mermaid
flowchart TB
  subgraph frameworks["framework packages"]
    angular["@soverius-ai/browser-models-angular"]
    react["@soverius-ai/browser-models-react"]
    vue["@soverius-ai/browser-models-vue"]
  end
  subgraph browserModels["@soverius-ai/browser-models"]
    agentEntry["/agent<br/>BrowserModelsAgent · ModelStore"]
    rootEntry["root entry<br/>AgentRun · OutputParser · ToolCallRepair · Engine · LocalToolSource"]
    engines["/prompt-api · /web-llm · /web-llm/worker · /transformers<br/>engines"]
    toolSources["/webmcp · /mcp<br/>tool sources"]
  end
  angular --> agentEntry
  react --> agentEntry
  vue --> agentEntry
  agentEntry --> rootEntry
  engines -.->|implement Engine| rootEntry
  toolSources -.->|implement LocalToolSource| rootEntry
  agentEntry --> agui["@ag-ui/client · rxjs"]
  rootEntry --> aguiCore["@ag-ui/core"]
  engines --> engineLibs["@mlc-ai/web-llm · @huggingface/transformers<br/>loaded on first use"]
```

The app creates the engines and tool sources and passes them to `BrowserModelsAgent`.

## One run

```mermaid
sequenceDiagram
  participant C as AG-UI client
  participant A as BrowserModelsAgent
  participant S as Tool sources
  participant E as Engine
  participant R as ToolCallRepair
  C->>A: run(RunAgentInput)
  A-->>C: RUN_STARTED
  A->>S: tools(signal)
  S-->>A: local tools
  A->>E: load()
  A-->>C: ACTIVITY_SNAPSHOT soverius.model (only while loading)
  loop up to maxSteps model calls
    A->>E: generate(chat messages)
    E-->>A: text fragments, split by OutputParser
    A-->>C: TEXT_MESSAGE_* · REASONING_*
    A-->>C: TOOL_CALL_START · TOOL_CALL_ARGS (while the model writes)
    A->>R: repair(complete raw call)
    R-->>A: valid call and repair steps
    A-->>C: rest of TOOL_CALL_ARGS or MESSAGES_SNAPSHOT, then TOOL_CALL_END
    A-->>C: TOOL_CALL_RESULT (local tools only)
  end
  A-->>C: RUN_FINISHED
```

Event details: [Agent → Events](./agent.md#events), [Tools → Streaming](./tools.md#streaming).

## Tool calls

```mermaid
flowchart TB
  written["tool call written by the model"] --> repairStep["repair: json · name · coerce · reask · hook"]
  repairStep -->|"invalid or cut off"| feedback["error as tool result, next model call"]
  repairStep -->|valid| toolKind{"tool kind"}
  toolKind -->|"frontend tool"| clientSide["run finishes, the client runs the tool and starts a follow-up run"]
  toolKind -->|"local tool"| localRun["the agent runs the tool, TOOL_CALL_RESULT, next model call"]
```

Frontend tools come from `RunAgentInput.tools`, local tools from `localTools`. See [Tools](./tools.md).

## Model state

```mermaid
stateDiagram-v2
  [*] --> checking
  checking --> available
  checking --> downloadable
  checking --> unavailable
  downloadable --> downloading: download()
  downloading --> available
  downloading --> downloadable: load failed (error)
  available --> downloadable: deleteModel()
```

`selectModel()` and `refresh()` start again at `checking`. See [Model state](./models.md).

## Repository

```text
libs/
  agent/browser-models      @soverius-ai/browser-models
  frameworks/angular        @soverius-ai/browser-models-angular
  frameworks/react          @soverius-ai/browser-models-react
  frameworks/vue            @soverius-ai/browser-models-vue
  examples/shared           private: demo engine, model list, example tools
apps/
  angular-copilotkit(-e2e)  CopilotKit Angular
  react-copilotkit(-e2e)    CopilotKit React
  vue-copilotkit(-e2e)      CopilotKit Vue
  vanilla-agui(-e2e)        plain @ag-ui/client, demo MCP server at /mcp
  docs                      this site; the examples are built into static/examples
Dockerfile                  nginx, port 8080, GET /health
```
