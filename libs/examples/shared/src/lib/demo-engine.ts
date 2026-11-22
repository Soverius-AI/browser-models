import type { Engine, GenerateRequest } from '@soverius-ai/browser-models';
import { barChart, tipCalculator, type SandboxDemo } from './sandbox-demos';

/**
 * A tiny scripted engine for trying the example without a real model, and for the e2e test.
 * Open an example with `?model=demo` to use it. It echoes messages and calls tools by keyword:
 * "time" → currentTime (local tool), "title" → pageTitle (WebMCP page tool), "sum" → demo__add (MCP), "incident" → show_incident, "background" →
 * change_background, "weather" → getWeather, "todo" → addTodo (CopilotKit docs tools),
 * "trip" → planTrip (a card that grows while its arguments stream),
 * "think" → thinking in <think> tags, then an answer,
 * "search the docs for <x>" or "how do I <x>" → searchDocs, then an answer and showDocsPage
 * (the docs assistant),
 * "calculator" or "chart" → generateSandboxedUi (CopilotKit's Open Generative UI: the model
 * writes HTML, CSS and JavaScript, shown in a sandboxed iframe; the chart loads Chart.js),
 * "docs for <library>" or "context7 <library>" → context7__resolve-library-id, then
 * context7__query-docs with the id it returned (Context7 over remote MCP), then a short summary.
 */
export function demoEngine(): Engine {
  let loaded = false;
  return {
    id: 'demo',
    supportsConstraint: false,
    availability: async () => 'available',
    // Simulates a short download (about 1 s) the first time, so the chat shows the loading card.
    async load({ onProgress } = {}) {
      if (loaded) return;
      for (let step = 1; step <= 10; step++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        onProgress?.(step / 10);
      }
      loaded = true;
    },
    async unload() {
      loaded = false;
    },
    async *generate(request) {
      let written = '';
      for await (const text of script(request)) {
        written += text;
        yield { type: 'text', text };
      }
      // A rough count, like a tokenizer would give: about 4 characters per token.
      const characters = request.messages.reduce(
        (sum, message) => sum + message.content.length,
        written.length,
      );
      yield {
        type: 'finish',
        reason: 'stop',
        usage: { totalTokens: Math.ceil(characters / 4) },
      };
    },
  };
}

/** What the demo model writes, in pieces. */
async function* script({
  messages,
  signal,
}: GenerateRequest): AsyncGenerator<string> {
  const last = messages.at(-1)?.content ?? '';
  const toolResult = /```tool_result\n(.*)\n```/s.exec(last)?.[1];
  if (toolResult) {
    const { name, result } = JSON.parse(toolResult) as ToolResult;
    const libraryId = LIBRARY_ID.exec(result)?.[1];
    if (name === 'searchDocs') {
      yield* docsAnswer(signal, result);
    } else if (name === 'showDocsPage') {
      // The card is the answer; nothing to add.
    } else if (name === 'context7__resolve-library-id' && libraryId) {
      yield* toolCall(signal, 'context7__query-docs', {
        libraryId,
        query: question(messages),
      });
    } else if (name === 'context7__query-docs' && result.startsWith('{')) {
      yield `Context7 found: ${excerpt(result)}`;
    } else {
      yield `The tool answered: ${result}`;
    }
  } else if (DOCS_QUESTION.test(last)) {
    yield* toolCall(signal, 'searchDocs', {
      query: DOCS_QUESTION.exec(last)?.[1] ?? last,
    });
  } else if (/\bthink\b/i.test(last)) {
    yield '<think>The user wants to see thinking. ';
    yield 'Small models write it in think tags.</think>';
    yield 'This is the answer, after the thinking.';
  } else if (CONTEXT7.test(last)) {
    yield* toolCall(signal, 'context7__resolve-library-id', {
      libraryName: CONTEXT7.exec(last)?.[1] ?? '',
      query: last,
    });
  } else if (/chart/i.test(last)) {
    yield* toolCall(signal, 'generateSandboxedUi', barChart, 30);
  } else if (/calculator/i.test(last)) {
    yield* toolCall(signal, 'generateSandboxedUi', tipCalculator, 30);
  } else if (/trip/i.test(last)) {
    yield* toolCall(signal, 'planTrip', {
      city: 'Vienna',
      stops: [
        'St. Stephen’s Cathedral',
        'Schönbrunn Palace',
        'Prater',
        'Naschmarkt',
      ],
    });
  } else if (/title/i.test(last)) {
    yield* toolCall(signal, 'pageTitle', {});
  } else if (/sum/i.test(last)) {
    yield* toolCall(signal, 'demo__add', { a: 2, b: 3 });
  } else if (/incident/i.test(last)) {
    yield* toolCall(signal, 'show_incident', {
      id: 'INC-4711',
      severity: 'sev1',
    });
  } else if (/background/i.test(last)) {
    yield* toolCall(signal, 'change_background', { color: 'lightblue' });
  } else if (/todo/i.test(last)) {
    yield* toolCall(signal, 'addTodo', {
      text: 'Buy milk',
      priority: 'high',
    });
  } else if (/weather/i.test(last)) {
    yield* toolCall(signal, 'getWeather', { city: 'Vienna' });
  } else if (/time/i.test(last)) {
    yield* toolCall(signal, 'currentTime', {});
  } else {
    yield `You said: ${last}`;
  }
}

interface ToolResult {
  readonly name: string;
  readonly result: string;
}

/** "search the docs for compaction" or "how do I check the Prompt API": the docs assistant. */
const DOCS_QUESTION = /(?:search the docs for|how do i)\s+(.+)/i;

/** "docs for react", "library id for react" or "context7 react": the library name follows the keyword. */
const CONTEXT7 = /(?:docs for|id for|context7)\s+([\w@./-]+)/i;
/** How Context7's resolve-library-id names a match, for example `/reactjs/react.dev`. */
const LIBRARY_ID = /library ID: (\/[\w.-]+\/[\w.-]+)/i;

/** The user's last own message: tool results also arrive as user messages. */
function question(messages: readonly { role: string; content: string }[]) {
  const own = messages.filter(
    ({ role, content }) =>
      role === 'user' && !content.startsWith('```tool_result'),
  );
  return own.at(-1)?.content ?? '';
}

/** The start of an MCP tool result (`{"content": "<text>", …}`) as one short line. */
function excerpt(result: string): string {
  const { content = result } = JSON.parse(result) as { content?: unknown };
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 240 ? `${line.slice(0, 240)}…` : line;
}

/** Writes a tool call a few characters at a time, like a model, so the chat shows it growing. */
async function* toolCall(
  signal: AbortSignal | undefined,
  name: string,
  args: Record<string, unknown> | SandboxDemo,
  chunk = 6,
): AsyncGenerator<string> {
  const block =
    '```tool_call\n' + JSON.stringify({ name, arguments: args }) + '\n```';
  for (let i = 0; i < block.length; i += chunk) {
    await new Promise((resolve) => setTimeout(resolve, 60));
    signal?.throwIfAborted();
    yield block.slice(i, i + chunk);
  }
}

/** Answers from the first section searchDocs found, then shows its page with showDocsPage. */
async function* docsAnswer(
  signal: AbortSignal | undefined,
  result: string,
): AsyncGenerator<string> {
  const [hit] = JSON.parse(result) as {
    readonly page: string;
    readonly title: string;
    readonly url: string;
    readonly excerpt: string;
  }[];
  if (!hit) {
    yield 'The docs do not answer that.';
    return;
  }
  yield `The docs explain it in ${hit.page} › ${hit.title}: ${hit.excerpt}\n`;
  yield* toolCall(signal, 'showDocsPage', { url: hit.url, title: hit.title });
}
