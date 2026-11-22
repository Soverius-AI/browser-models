---
title: Streaming
---

# Streaming

`generate()` yields parts: `text` while the model writes, then one `finish`. Engines keep no history: send the whole conversation every time.

```ts
import type { ChatMessage } from '@soverius-ai/browser-models';

const history: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
let answer = '';
for await (const part of engine.generate({ messages: history })) {
  if (part.type === 'text') answer += part.text;
  else console.log(part.reason, part.usage); // 'stop' | 'length', { totalTokens, promptTokens?, outputTokens? }
}
history.push({ role: 'assistant', content: answer });
```

| Engine          | Text from           | `usage`                                | `reason: 'length'`        |
| --------------- | ------------------- | -------------------------------------- | ------------------------- |
| Prompt API      | `promptStreaming()` | `totalTokens` (`session.contextUsage`) | never                     |
| WebLLM          | OpenAI-style chunks | all three (`include_usage`)            | `finish_reason: 'length'` |
| transformers.js | `TextStreamer`      | all three (its tokenizer)              | `maxOutputTokens` reached |

## Thinking

Models like Qwen3 think in `<think>` tags. `OutputParser` splits that from the answer while the text streams.

```ts
import { OutputParser } from '@soverius-ai/browser-models';

const parser = new OutputParser();
for await (const part of engine.generate({ messages: history })) {
  if (part.type !== 'text') continue;
  for (const piece of parser.push(part.text)) {
    if (piece.kind === 'reasoning') showThinking(piece.text);
    if (piece.kind === 'text') showAnswer(piece.text);
  }
}
parser.end();
```

## Stop

```ts
const stop = new AbortController();
button.onclick = () => stop.abort();
for await (const part of engine.generate({
  messages: history,
  signal: stop.signal,
})) {
  // generate() throws an AbortError when stopped
}
```

Example: `apps/engine-chat` ([Playground](/playground?platform=engine)). API: [Engine](../api/browser-models/core.md#engine), [EnginePart](../api/browser-models/core.md#enginepart), [OutputParser](../api/browser-models/core.md#outputparser)
