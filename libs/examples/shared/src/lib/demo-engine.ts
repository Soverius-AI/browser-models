import type { Engine } from '@soverius-ai/browser-models';
import { barChart, tipCalculator, type SandboxDemo } from './sandbox-demos';

/**
 * A tiny scripted engine for trying the example without a real model, and for the e2e test.
 * Open an example with `?model=demo` to use it. It echoes messages and calls tools by keyword:
 * "time" → currentTime (local tool), "title" → pageTitle (WebMCP page tool), "sum" → demo__add (MCP), "incident" → show_incident, "background" →
 * change_background, "weather" → getWeather, "todo" → addTodo (CopilotKit docs tools),
 * "trip" → planTrip (a card that grows while its arguments stream),
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
    async *generate({ messages, signal }) {
      const last = messages.at(-1)?.content ?? '';
      const toolResult = /```tool_result\n(.*)\n```/s.exec(last)?.[1];
      if (toolResult) {
        const { name, result } = JSON.parse(toolResult) as ToolResult;
        const libraryId = LIBRARY_ID.exec(result)?.[1];
        if (name === 'context7__resolve-library-id' && libraryId) {
          yield* toolCall(signal, 'context7__query-docs', {
            libraryId,
            query: question(messages),
          });
        } else if (name === 'context7__query-docs' && result.startsWith('{')) {
          yield `Context7 found: ${excerpt(result)}`;
        } else {
          yield `The tool answered: ${result}`;
        }
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
    },
  };
}

interface ToolResult {
  readonly name: string;
  readonly result: string;
}

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
