---
title: Context
---

# Context

The context holds everything the model reads and writes in one call: system prompt, tool descriptions, conversation, tool results, reply.

```mermaid
flowchart LR
  prompt["prompt of the next call"] --> fits{"> 90 % of contextWindowSize?"}
  fits -->|no| send["send as it is"]
  fits -->|yes| cut["keep the newest turns, cut at a user message"]
  cut --> summary["older turns → summary (one model call)"]
  summary --> results{"still too large?"}
  results -->|yes| shorten["cut tool results, oldest first"]
  results -->|no| send
  shorten --> send
```

| Engine          | Context size                                                    | Token counts after a call |
| --------------- | --------------------------------------------------------------- | ------------------------- |
| Prompt API      | set by the browser, known after the first answer                | `session.contextUsage`    |
| WebLLM          | `contextWindowSize`, else the model's build value (mostly 4096) | `usage` of the last chunk |
| transformers.js | `contextWindowSize` (only the compaction budget)                | its tokenizer             |

The size estimate starts at 3 characters per token and then uses what the engine counted for the thread. Options and sizes: [Compaction](../agent/compaction.md).
