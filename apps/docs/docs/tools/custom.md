---
title: Custom Tools
---

# Custom Tools

`ToolCalling` implements the `Tools` interface of `@soverius-ai/browser-models-agui`. Implement it for another call format or check; the agent keeps the AG-UI side: streaming, snapshots, `TOOL_CALL_*` events.

| `Tools.start(run)` returns | Meaning                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `tools`, `instructions`    | the tools the model may call, and how, for the system prompt       |
| `errors`, `maxSteps`       | problems to report, model calls per run                            |
| `readPartial(raw)`         | name and arguments so far of a call being written, for streaming   |
| `check(raw, prompt)`       | the finished call: `{ ok, call, steps }` or `{ ok: false, error }` |
| `run(call)`                | the result of a tool of the agent; `undefined` for a client tool   |

```ts
import {
  BrowserModelsAgent,
  type RunTools,
  type Tools,
  type ToolsRun,
} from '@soverius-ai/browser-models-agui';

/** The client's tools only, and calls in strict JSON: no repair, no schema check. */
class StrictClientTools implements Tools {
  async start({ input }: ToolsRun): Promise<RunTools> {
    return {
      tools: input.tools,
      instructions: `Call a tool with a \`\`\`tool_call block. Tools: ${input.tools.map((tool) => tool.name).join(', ')}`,
      errors: [],
      maxSteps: 1,
      readPartial: () => undefined, // nothing streams: the call is sent when it is complete
      async check(raw) {
        try {
          const { name, arguments: args = {} } = JSON.parse(raw);
          return { ok: true, call: { name, arguments: args }, steps: [] };
        } catch {
          return { ok: false, error: 'The call is not valid JSON.' };
        }
      },
      run: () => undefined, // every tool is the client's
    };
  }
}

new BrowserModelsAgent({
  models,
  defaultModel: 'gemma',
  tools: new StrictClientTools(),
});
```

API: [Tools](../api/browser-models-agui/index.md#tools), [RunTools](../api/browser-models-agui/index.md#runtools)
