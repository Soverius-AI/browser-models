---
title: Compaction
---

# Compaction

A long conversation outgrows the model's context. Before every model call the agent hands the prompt to a `Compaction`, which returns what the model gets. On by default, with `SummaryCompaction`. Flow: [Context](../architecture/context.md).

| `compaction`                   | What                                      |
| ------------------------------ | ----------------------------------------- |
| not set                        | `new SummaryCompaction()`                 |
| `new SummaryCompaction({ … })` | the same with other sizes                 |
| your own `Compaction`          | [your own algorithm](#your-own-algorithm) |
| `false`                        | off                                       |

## SummaryCompaction

The approach of the [pi coding agent](https://github.com/badlogic/pi-mono): the newest turns stay word for word, everything older becomes a summary. The sizes are made for small models.

```ts
import { SummaryCompaction } from '@soverius-ai/browser-models-agui';

new BrowserModelsAgent({
  models,
  defaultModel: 'gemma',
  compaction: new SummaryCompaction({ threshold: 0.9, keepRecent: 0.25 }),
});
```

| Option               | Default | Purpose                                                                                                                        |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `threshold`          | `0.9`   | compact when the prompt fills more than this share of the context                                                              |
| `keepRecent`         | `0.25`  | share of the context the newest turns may take; they stay word for word                                                        |
| `summarize`          | `true`  | the model writes a summary of the older turns; `false` leaves them out                                                         |
| `charactersPerToken` | `3`     | for the size estimate until the engine counted a call ([Token counts](#token-counts)); use `1` for Chinese, Japanese or Korean |

### Steps

| Step | What                                                                                                               | Cost           |
| ---- | ------------------------------------------------------------------------------------------------------------------ | -------------- |
| 1    | find the cut: walk back from the newest message until `keepRecent` is collected, then cut at the next user message | none           |
| 2    | the turns before the cut become a summary; the turns after it stay as they are                                     | one model call |
| 3    | still too large: tool results are cut, oldest first                                                                | none           |

```text
before   system  Q1 A1 Q2 A2 Q3 A3 Q4 A4 Q5 A5  Q6
                 └── summarized ──┘ └─ kept ──┘  current turn
after    system + summary           Q4 A4 Q5 A5  Q6
```

- The cut is always at a user message: a turn stays whole and the chat still starts with the user.
- The cut and its summary are kept in the `SummaryCompaction`, by thread. The next model calls and runs reuse them. The next compaction updates the summary with the turns since, including the ones that were kept before.
- A summary is only written when the turns before the cut fill at least 5 % of the context. Less is not worth a model call.
- Without a summary (`summarize: false`, or the model failed) the turns before the cut are left out.
- The system prompt, the tool descriptions and the current turn are never removed. If they alone are too large, use a larger `contextWindowSize` or fewer tools.
- The client's messages do not change: the user keeps the whole conversation on screen.

### Sizes

All sizes are shares of the context, so they fit a model with 4096 tokens and one with 128 000.

| What                                         | Share            | 4096 tokens | 16 384 tokens |
| -------------------------------------------- | ---------------- | ----------- | ------------- |
| compaction starts above (`threshold`)        | 90 %             | 3686        | 14 745        |
| newest turns that stay (`keepRecent`)        | 25 %             | 1024        | 4096          |
| the summary                                  | 8 %, at most 600 | 328         | 600           |
| one message in the text the model summarizes | 5 %              | 205         | 819           |
| what stays of a cut tool result              | 2.5 %            | 102         | 410           |

- The newest turns never take more than half of the room the conversation has. With a small context the system prompt and the tool descriptions take most of it.
- The newest tool result keeps as much as there is room for.

### Summary

The model gets the older turns as text in `<conversation>` tags, so it does not continue them, and this format:

```text
Goal: what the user wants
Facts: names, numbers, decisions and what tools returned
Open: what is still to do, or "nothing"
```

The summary goes to the end of the system prompt. A later compaction gets the summary in `<previous-summary>` tags and updates it.

### Differences to pi

| pi                                                              | here                                                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| checks after a run and before a prompt                          | before every model call: a run with tools grows while it runs                                        |
| may cut at an assistant message and summarizes the turn's start | cuts at user messages only; a turn that is too large gets its tool results cut, without a model call |
| `reserveTokens` and `keepRecentTokens` in tokens                | shares of the context                                                                                |
| long structured summary                                         | three lines, sized to the context                                                                    |
| real token counts from the provider                             | an estimate from the text length, set to the engine's real counts ([Token counts](#token-counts))    |
| stored in the session file                                      | in memory, per `SummaryCompaction`                                                                   |

## Your own algorithm

Implement `Compaction` and pass it to the agent.

```ts
interface Compaction {
  compact(request: CompactionRequest): Promise<readonly ChatMessage[]>;
}
```

| `request`  | What                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| `threadId` | the thread of the run                                                          |
| `messages` | what the model would get, see below                                            |
| `engine`   | the model of the run: `contextWindowSize`, and `generate()` to write a summary |
| `signal`   | aborts when the run is stopped                                                 |
| `report`   | sends the [event](#event) `soverius.compaction` with the value you pass        |
| `lastCall` | the run's last model call: `{ tokens, characters }` the engine counted, if any |

`messages`, in this order:

| Message                              | `role`                | `source`          |
| ------------------------------------ | --------------------- | ----------------- |
| the system prompt, if there is one   | `system`              | –                 |
| the client's conversation            | `user` or `assistant` | the AG-UI message |
| tool calls and results the run added | `assistant`, `user`   | –                 |

- Tool results have the role `user`. A message of the user has `source.role === 'user'`.
- `compact()` is called before every model call. Return `request.messages` to change nothing.
- Every call gets the whole conversation again, also what an earlier call left out. Keep what is expensive to make, for example a summary, by `threadId`.
- Keep the newest user message and everything after it: it is the turn the model answers.
- An error fails the run.

```ts
import type {
  Compaction,
  CompactionRequest,
} from '@soverius-ai/browser-models-agui';

/** The model gets the system prompt and the last three turns. */
class LastTurns implements Compaction {
  async compact({ messages }: CompactionRequest) {
    const turns = messages.flatMap((message, index) =>
      message.source?.role === 'user' ? [index] : [],
    );
    const from = turns.at(-3) ?? 0;
    return messages.filter(
      (message, index) => message.role === 'system' || index >= from,
    );
  }
}

new BrowserModelsAgent({
  models,
  defaultModel: 'gemma',
  compaction: new LastTurns(),
});
```

## Token counts

The estimate starts at `charactersPerToken` (3). After a model call the engine reports how many tokens prompt and reply took; from then on `SummaryCompaction` divides by what that call measured, per thread. Calls under 64 tokens are not used, and the value stays between 1 and 8.

| Engine          | Counts                                 |
| --------------- | -------------------------------------- |
| Prompt API      | `session.contextUsage`                 |
| WebLLM          | `usage` of the last chunk              |
| transformers.js | its tokenizer: prompt and reply tokens |

## Context size

`SummaryCompaction` reads `engine.contextWindowSize` after `load()`. Without it nothing is compacted.

| Engine          | `contextWindowSize`                                                              |
| --------------- | -------------------------------------------------------------------------------- |
| WebLLM          | the option, else what the model was built with ([WebLLM](../engines/web-llm.md)) |
| Prompt API      | from the browser, known after the first answer                                   |
| transformers.js | only the option: the library has no limit of its own                             |
| Custom engine   | the optional member `contextWindowSize`                                          |

## Event

`CUSTOM` `soverius.compaction`. Token counts are estimates.

| `value`                                                                                            | When                                                      |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `{ status: 'summarizing', tokens, contextWindowSize }`                                             | before the model writes the summary                       |
| `{ status: 'done', tokensBefore, tokensAfter, contextWindowSize, summarized, shortened, dropped }` | after a new cut, and before a model call with cut results |

- `summarized`, `dropped`: messages before a new cut, with and without a summary. A cut that is reused is not reported again.
- `shortened`: messages with cut tool results. Reported for every model call it happens in.

```ts
import { AgentEvents } from '@soverius-ai/browser-models-agui';

agent.subscribe({
  onCustomEvent: ({ event }) => {
    const status = AgentEvents.compaction(event);
    if (status?.status === 'summarizing')
      showHint('Summarizing the conversation…');
  },
});
```

Try it: the examples take `?context=<tokens>` for the WebLLM models. With `?context=4096` a few questions are enough. The [Playground](/playground)'s "Devtools" switch lists the event.
