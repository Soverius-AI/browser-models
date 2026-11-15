import {
  AbstractAgent,
  EventType,
  type BaseEvent,
  type RunAgentInput,
} from '@ag-ui/client';
import { from, lastValueFrom, toArray, type Observable } from 'rxjs';
import { OpenGenerativeUi } from './copilotkit.ts';

const page = {
  initialHeight: 200,
  css: 'h1 { color: red; }',
  html: '<h1>Hello</h1><p>World</p>',
  jsFunctions: 'function init() {}',
  jsExpressions: ['init()', 'done()'],
};

/** An agent that replays a list of events. */
class Scripted extends AbstractAgent {
  constructor(private readonly events: BaseEvent[]) {
    super();
  }
  run(): Observable<BaseEvent> {
    return from(this.events);
  }
}

/** A tool call whose arguments arrive in pieces of `size` characters. */
function toolCall(name: string, args: object, size: number): BaseEvent[] {
  const json = JSON.stringify(args);
  const deltas = json.match(new RegExp(`.{1,${size}}`, 'gs')) ?? [];
  return [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-1',
      toolCallName: name,
    },
    ...deltas.map((delta) => ({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-1',
      delta,
    })),
    { type: EventType.TOOL_CALL_END, toolCallId: 'call-1' },
  ] as BaseEvent[];
}

async function run(events: BaseEvent[]): Promise<BaseEvent[]> {
  const input = { threadId: 't', runId: 'r', messages: [], tools: [] };
  return lastValueFrom(
    new OpenGenerativeUi()
      .run(input as unknown as RunAgentInput, new Scripted(events))
      .pipe(toArray()),
  );
}

interface Activity {
  readonly type: EventType;
  readonly messageId: string;
  readonly activityType: string;
  readonly content: {
    readonly generating: boolean;
    readonly css?: string;
    readonly cssComplete?: boolean;
    readonly html?: string[];
    readonly htmlComplete?: boolean;
    readonly jsFunctionsComplete?: boolean;
    readonly jsExpressions?: string[];
    readonly jsExpressionsComplete?: boolean;
  };
}

function activities(events: BaseEvent[]): Activity[] {
  return events.filter(
    (event) => event.type === EventType.ACTIVITY_SNAPSHOT,
  ) as unknown as Activity[];
}

describe('OpenGenerativeUi', () => {
  it('opens the sandbox activity before the tool call and closes it with the result', async () => {
    const events = await run(toolCall('generateSandboxedUi', page, 12));
    const all = activities(events);

    expect(events[0]?.type).toBe(EventType.ACTIVITY_SNAPSHOT);
    expect(events[1]?.type).toBe(EventType.TOOL_CALL_START);
    expect(all[0]).toMatchObject({
      messageId: 'call-1-activity',
      activityType: 'open-generative-ui',
      content: { generating: true },
    });
    expect(all.at(-1)?.content).toEqual({
      initialHeight: 200,
      generating: false,
      css: page.css,
      cssComplete: true,
      html: expect.any(Array),
      htmlComplete: true,
      jsFunctions: page.jsFunctions,
      jsFunctionsComplete: true,
      jsExpressions: page.jsExpressions,
      jsExpressionsComplete: true,
    });
    expect(all.at(-1)?.content.html?.join('')).toBe(page.html);
  });

  it('reports the HTML piece by piece while the model writes it', async () => {
    const all = activities(
      await run(toolCall('generateSandboxedUi', page, 12)),
    );
    const writingHtml = all.filter(
      ({ content }) => content.html && !content.htmlComplete,
    );

    expect(writingHtml.length).toBeGreaterThan(1);
    // The CSS is finished before any HTML shows, and the pieces only ever grow.
    expect(writingHtml.every(({ content }) => content.cssComplete)).toBe(true);
    const lengths = writingHtml.map(
      ({ content }) => content.html?.join('').length ?? 0,
    );
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(
      page.html.startsWith(writingHtml[0]?.content.html?.join('') ?? '-'),
    ).toBe(true);
  });

  it('runs an expression only once it is complete', async () => {
    const all = activities(await run(toolCall('generateSandboxedUi', page, 5)));

    for (const { content } of all) {
      for (const expression of content.jsExpressions ?? [])
        expect(page.jsExpressions).toContain(expression);
    }
  });

  it('leaves other tool calls and events alone', async () => {
    const events = [
      { type: EventType.RUN_STARTED, threadId: 't', runId: 'r' },
      ...toolCall('getWeather', { city: 'Vienna' }, 8),
      { type: EventType.RUN_FINISHED, threadId: 't', runId: 'r' },
    ] as BaseEvent[];

    expect(await run(events)).toEqual(events);
  });

  it('shows the repaired page when the agent corrects a streamed call', async () => {
    const [start, ...rest] = toolCall(
      'generateSandboxedUi',
      { ...page, html: '<h1>Hel' },
      400,
    );
    const end = rest.at(-1);
    const correction = {
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'generateSandboxedUi',
                arguments: JSON.stringify({
                  ...page,
                  css: 'h1 { color: blue; }',
                }),
              },
            },
          ],
        },
      ],
    };
    const events = await run([
      start,
      ...rest.slice(0, -1),
      correction,
      end,
    ] as BaseEvent[]);

    const last = activities(events).at(-1)?.content;
    expect(last).toMatchObject({
      generating: false,
      css: 'h1 { color: blue; }',
      jsExpressions: page.jsExpressions,
    });
    expect(last?.html?.join('')).toBe(page.html);
  });
});
