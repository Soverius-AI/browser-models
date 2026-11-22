---
title: Repair & streaming
---

# Repair & streaming

Small models write broken calls. `ToolCalling` repairs every call before it runs, and streams it while the model writes. Flow: [Tool calls](../architecture/tool-calls.md).

## Call formats

| Format | Example                                          |
| ------ | ------------------------------------------------ |
| fenced | ` ```tool_call {"name": …, "arguments": …} ``` ` |
| tags   | `<tool_call>{…}</tool_call>`                     |

## Streaming

A call is sent while the model writes it. Repair runs once, when the call is complete.

| When                              | Events                                                                |
| --------------------------------- | --------------------------------------------------------------------- |
| name complete, tool known         | `TOOL_CALL_START` (repaired name)                                     |
| arguments arrive                  | `TOOL_CALL_ARGS` deltas                                               |
| output done, repair changed none  | `TOOL_CALL_ARGS` (the rest), `TOOL_CALL_END`                          |
| repair changed name or arguments  | `CUSTOM` `soverius.tool_repair`, `MESSAGES_SNAPSHOT`, `TOOL_CALL_END` |
| not repairable, cut off, or abort | `MESSAGES_SNAPSHOT` (call removed), `TOOL_CALL_END`                   |

```text
clean      START  ARGS {"city":"Vie  ARGS nna"  ARGS }                 END
repaired   START  ARGS {"days":"3"   CUSTOM  MESSAGES_SNAPSHOT {"days":3}  END
```

- At `TOOL_CALL_END` the client holds the repaired call: joined deltas, or the snapshot.
- `MESSAGES_SNAPSHOT` = the run's input messages + this run's messages. AG-UI has no event to take back sent arguments.
- Unknown tool name: nothing is streamed.
- A call the output ends in (for example the token limit) is not run. The model is told.

## Repair

Every call is repaired before it runs. First step that yields a valid call wins.

| Step     | Fixes                                                                       |
| -------- | --------------------------------------------------------------------------- |
| `json`   | broken JSON (`jsonrepair`), arguments as string                             |
| `name`   | case, `snake_case`, `functions.` prefix, small typos                        |
| `coerce` | `"5"` → `5`, `"true"` → `true`, value → array, defaults, extra keys, `null` |
| `reask`  | one more model call with the call, the error and the schema                 |
| `hook`   | `repairHook({ raw, error, tools })`                                         |

Not repairable, or re-ask / hook throws: error goes back to the model as a tool result.

API: [ToolCallRepair](../api/browser-models-tools/tool-calling.md#toolcallrepair), [ArgumentsSchema](../api/browser-models-tools/tool-calling.md#argumentsschema)
