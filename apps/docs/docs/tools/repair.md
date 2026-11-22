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

A call is streamed while the model writes it. Repair runs once, when the call is complete. Full flow: [Tool calls](../architecture/tool-calls.md).

| What the client sees                        | Events                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| name complete, tool known                   | `TOOL_CALL_START` (repaired name), then `TOOL_CALL_ARGS` deltas             |
| call complete, any repair step              | `CUSTOM` `soverius.tool_repair` `{ toolCallId, raw, steps }`                |
| never streamed (name known only at the end) | `TOOL_CALL_START` after the `CUSTOM` event, the arguments, `TOOL_CALL_END`  |
| repaired arguments continue what was sent   | `TOOL_CALL_ARGS` (the rest), `TOOL_CALL_END`                                |
| streamed, name changed or arguments differ  | `MESSAGES_SNAPSHOT` (repaired call), `TOOL_CALL_END`                        |
| not repairable or cut off                   | streamed: `MESSAGES_SNAPSHOT` (call removed), `TOOL_CALL_END`; else nothing |

```text
clean      START  ARGS {"city":"Vie  ARGS nna"  ARGS }                 END
repaired   START  ARGS {"days":"3"   CUSTOM  MESSAGES_SNAPSHOT {"days":3}  END
```

- At `TOOL_CALL_END` the client holds the repaired call.
- A call that is not repairable or cut off (for example by the token limit) is not run. Its error goes back to the model as a tool result if the run has a model call left (`maxSteps`).

## Repair

Every call is repaired before it runs. The steps add up: `steps` lists every step a call took.

| Step     | Fixes                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------- |
| `json`   | broken JSON (`jsonrepair`), arguments as a JSON string                                              |
| `name`   | another spelling of a tool name, see below                                                          |
| `coerce` | `"5"` → `5`, `"true"` → `true`, `5` → `"5"`, value → array, enum case, `null`, extra keys, defaults |
| `reask`  | arguments still invalid: one more model call with the call, the error and the schema                |
| `hook`   | everything else failed: `repairHook({ raw, error, tools })`; then the only step reported            |

| Model writes                                              | Tool         |
| --------------------------------------------------------- | ------------ |
| `default_api.searchDocs` (Gemini)                         | `searchDocs` |
| `functions.searchDocs`, `searchDocs()`                    | `searchDocs` |
| `search_docs`, `SEARCH-DOCS`, surrounding spaces          | `searchDocs` |
| `serchDocs` (one typo, edit distance ≤ 2, only one match) | `searchDocs` |

Not repairable, or the hook throws or returns nothing: the error goes back to the model, if a model call is left.

API: [ToolCallRepair](../api/browser-models-tools/tool-calling.md#toolcallrepair), [ArgumentsSchema](../api/browser-models-tools/tool-calling.md#argumentsschema)
