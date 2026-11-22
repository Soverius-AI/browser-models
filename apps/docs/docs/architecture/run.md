---
title: A run
---

# A run

```mermaid
sequenceDiagram
  participant C as AG-UI client (CopilotKit)
  participant A as BrowserModelsAgent
  participant T as ToolCalling
  participant K as Compaction
  participant E as Engine
  C->>A: run(RunAgentInput)
  A-->>C: RUN_STARTED
  A->>T: start(run)
  T-->>A: tools, instructions (tool sources read)
  A-->>C: CUSTOM soverius.tool_source_error (a source failed)
  A->>E: load()
  A-->>C: ACTIVITY_SNAPSHOT soverius.model (only while loading)
  loop up to maxSteps model calls (one without ToolCalling)
    A->>K: compact(prompt, last call's token count)
    A-->>C: CUSTOM soverius.compaction (only when it compacts)
    K-->>A: prompt that fits the context
    A->>E: generate(prompt)
    E-->>A: text parts, then finish (reason, tokens)
    A-->>C: TEXT_MESSAGE_* · REASONING_*
    A-->>C: TOOL_CALL_START · TOOL_CALL_ARGS (while the model writes)
    A->>T: check(complete call)
    T-->>A: valid call and repair steps
    A-->>C: CUSTOM soverius.tool_repair (when it was repaired)
    A-->>C: rest of TOOL_CALL_ARGS or MESSAGES_SNAPSHOT, then TOOL_CALL_END
    A-->>C: TOOL_CALL_RESULT (tools of the agent only)
  end
  A-->>C: RUN_FINISHED
```

| Step                    | Ends the run when                                         |
| ----------------------- | --------------------------------------------------------- |
| a reply without a call  | always                                                    |
| a call to a client tool | always: the client runs it and starts a follow-up run     |
| a call to an agent tool | never: the result goes back to the model in the next step |
| `maxSteps` reached      | always                                                    |
| stop or error           | `RUN_ERROR` (`code: 'abort'` when stopped)                |

The client keeps the conversation; the agent gets it with every run. Event list: [Events](../agent/events.md).
