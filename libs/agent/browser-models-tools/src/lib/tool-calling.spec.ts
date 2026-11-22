import { AbstractAgent } from '@ag-ui/client';
import {
  EventType,
  type Event as AgUiEvent,
  type Message,
  type RunAgentInput,
  type Tool,
} from '@ag-ui/core';
import { from } from 'rxjs';
import type { Engine, GenerateRequest } from '@soverius-ai/browser-models';
import {
  AgentRun,
  SummaryCompaction,
  type Compaction,
  type CompactionRequest,
  type CompactionStatus,
  type RunOptions,
} from '@soverius-ai/browser-models-agui';
import { ToolCalling, type ToolCallingOptions } from './tool-calling.ts';
import type { LocalTool } from './tools.ts';

/** A run of the agent with tool calling. */
function run({
  localTools,
  maxSteps,
  repairHook,
  ...options
}: Omit<RunOptions, 'tools'> & ToolCallingOptions): AsyncGenerator<AgUiEvent> {
  const tools = new ToolCalling({
    ...(localTools ? { localTools } : {}),
    ...(maxSteps ? { maxSteps } : {}),
    ...(repairHook ? { repairHook } : {}),
  });
  return new AgentRun({ ...options, tools }).events();
}

/** An engine that replies with scripted text, split into small chunks like a real stream. */
function scriptedEngine(
  ...replies: string[]
): Engine & { requests: GenerateRequest[] } {
  const requests: GenerateRequest[] = [];
  return {
    id: 'scripted',
    supportsConstraint: false,
    requests,
    availability: async () => 'available',
    load: async () => undefined,
    unload: async () => undefined,
    async *generate(request) {
      requests.push(request);
      const reply = replies[requests.length - 1] ?? '';
      for (let i = 0; i < reply.length; i += 4)
        yield { type: 'text', text: reply.slice(i, i + 4) };
    },
  };
}

function input(tools: Tool[] = []): RunAgentInput {
  return {
    threadId: 'thread',
    runId: 'run',
    messages: [{ id: '1', role: 'user', content: 'Weather in Vienna?' }],
    tools,
    context: [],
  };
}

async function collect(events: AsyncIterable<AgUiEvent>): Promise<AgUiEvent[]> {
  const result: AgUiEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

/** An engine that replies with exactly these fragments. */
function fragmentEngine(...fragments: string[]): Engine {
  return {
    ...scriptedEngine(),
    async *generate() {
      for (const text of fragments) yield { type: 'text' as const, text };
    },
  };
}

/** The messages a real AG-UI client holds after these events (it also checks the event order). */
async function clientMessages(events: AgUiEvent[]): Promise<Message[]> {
  class Replay extends AbstractAgent {
    run() {
      return from(events);
    }
  }
  const agent = new Replay({ initialMessages: input().messages });
  await agent.runAgent().catch(() => undefined); // RUN_ERROR rejects
  return agent.messages;
}

/** The tool calls the client holds, as `name(arguments)`. */
async function clientToolCalls(events: AgUiEvent[]): Promise<string[]> {
  return (await clientMessages(events)).flatMap((message) =>
    message.role === 'assistant'
      ? (message.toolCalls ?? []).map(
          (call) => `${call.function.name}(${call.function.arguments})`,
        )
      : [],
  );
}

function types(events: AgUiEvent[]): EventType[] {
  return events.map((event) => event.type);
}

function argsDeltas(events: AgUiEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === EventType.TOOL_CALL_ARGS ? [event.delta] : [],
  );
}

const weatherTool: Tool = {
  name: 'getWeather',
  description: 'Weather for a city',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
};
const call =
  '```tool_call\n{"name": "getWeather", "arguments": {"city": "Vienna"}}\n```';

describe('AgentRun', () => {
  it('streams a text answer', async () => {
    const events = await collect(
      run({ engine: scriptedEngine('It is sunny.'), input: input() }),
    );

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      ...Array<EventType>(3).fill(EventType.TEXT_MESSAGE_CONTENT),
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    const text = events.flatMap((event) =>
      event.type === EventType.TEXT_MESSAGE_CONTENT ? [event.delta] : [],
    );
    expect(text.join('')).toBe('It is sunny.');
  });

  it('emits a frontend tool call and ends the run, so the client can run the tool', async () => {
    const engine = scriptedEngine(call);
    const events = await collect(run({ engine, input: input([weatherTool]) }));

    const deltas = argsDeltas(events);
    expect(types(events)).toEqual([
      EventType.RUN_STARTED,
      EventType.TOOL_CALL_START,
      ...deltas.map(() => EventType.TOOL_CALL_ARGS),
      EventType.TOOL_CALL_END,
      EventType.RUN_FINISHED,
    ]);
    expect(deltas.join('')).toBe('{"city":"Vienna"}');
    expect(engine.requests).toHaveLength(1);
  });

  it('runs a local tool and continues with its result', async () => {
    const engine = scriptedEngine(call, 'It is 21 °C in Vienna.');
    const getWeather: LocalTool<{ city: string }> = {
      ...weatherTool,
      execute: async ({ city }) => ({ city, celsius: 21 }),
    };

    const events = await collect(
      run({ engine, input: input(), localTools: [getWeather] }),
    );

    expect(
      events.find((event) => event.type === EventType.TOOL_CALL_RESULT),
    ).toMatchObject({
      content: '{"city":"Vienna","celsius":21}',
    });
    expect(engine.requests[1]?.messages.at(-1)?.content).toContain(
      'tool_result',
    );
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });

  it('repairs a broken call and reports the repair', async () => {
    const broken =
      "```tool_call\n{name: 'get_weather', arguments: {city: 'Vienna'}\n```";
    const events = await collect(
      run({ engine: scriptedEngine(broken), input: input([weatherTool]) }),
    );

    expect(
      events.find((event) => event.type === EventType.CUSTOM),
    ).toMatchObject({
      name: 'soverius.tool_repair',
      value: { steps: ['json', 'name'] },
    });
    expect(
      events.find((event) => event.type === EventType.TOOL_CALL_START),
    ).toMatchObject({
      toolCallName: 'getWeather',
    });
  });

  it('streams thinking as reasoning events before the answer', async () => {
    const events = await collect(
      run({
        engine: scriptedEngine('<think>Easy.</think>\n\nIt is sunny.'),
        input: input(),
      }),
    );
    const types = events.map((event) => event.type);
    expect(types.slice(0, 4)).toEqual([
      EventType.RUN_STARTED,
      EventType.REASONING_START,
      EventType.REASONING_MESSAGE_START,
      EventType.REASONING_MESSAGE_CONTENT,
    ]);
    expect(types).toContain(EventType.REASONING_END);
    const text = events.flatMap((event) =>
      event.type === EventType.TEXT_MESSAGE_CONTENT ? [event.delta] : [],
    );
    expect(text.join('')).toBe('It is sunny.');
  });

  it('ignores thinking in the answer to a re-ask', async () => {
    const missingCity =
      '```tool_call\n{"name": "getWeather", "arguments": {}}\n```';
    const engine = scriptedEngine(
      missingCity,
      '<think>Need a city.</think>{"city": "Graz"}',
    );
    const events = await collect(run({ engine, input: input([weatherTool]) }));

    expect(await clientToolCalls(events)).toEqual([
      'getWeather({"city":"Graz"})',
    ]);
  });

  it('reports model loading as an AG-UI activity before the answer', async () => {
    const engine: Engine = {
      ...scriptedEngine('Hi.'),
      load: async ({ onProgress } = {}) => {
        onProgress?.(0.5);
        onProgress?.(0.501); // same whole percent: no extra event
        onProgress?.(1);
      },
    };
    const events = await collect(run({ engine, input: input() }));

    const activity = events.filter(
      (event) => event.type === EventType.ACTIVITY_SNAPSHOT,
    );
    expect(activity.map((event) => event.content)).toEqual([
      { engineId: 'scripted', status: 'loading', progress: 0.5 },
      { engineId: 'scripted', status: 'loading', progress: 1 },
      { engineId: 'scripted', status: 'ready', progress: 1 },
    ]);
    expect(
      events.findIndex((event) => event.type === EventType.ACTIVITY_SNAPSHOT),
    ).toBe(1);
  });

  it('adds no activity events when the model is already loaded', async () => {
    const events = await collect(
      run({ engine: scriptedEngine('Hi.'), input: input() }),
    );
    expect(
      events.some((event) => event.type === EventType.ACTIVITY_SNAPSHOT),
    ).toBe(false);
  });

  it('ends with RUN_ERROR when the run is stopped', async () => {
    const abort = new AbortController();
    const engine: Engine = {
      ...scriptedEngine(),
      // eslint-disable-next-line require-yield
      async *generate() {
        abort.abort();
        throw new Error('aborted');
      },
    };
    const events = await collect(
      run({ engine, input: input(), signal: abort.signal }),
    );
    expect(events.at(-1)).toEqual({
      type: EventType.RUN_ERROR,
      message: 'The run was stopped.',
      code: 'abort',
    });
  });

  it('stops after maxSteps model calls', async () => {
    const engine = scriptedEngine(call, call, call);
    const loop: LocalTool = { ...weatherTool, execute: async () => 'again' };
    const events = await collect(
      run({ engine, input: input(), localTools: [loop], maxSteps: 2 }),
    );

    expect(engine.requests).toHaveLength(2);
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });

  it('runs local tools and ends the run when the same turn also calls a frontend tool', async () => {
    const both =
      call + '\n```tool_call\n{"name": "showMap", "arguments": {}}\n```';
    const engine = scriptedEngine(both);
    const local: LocalTool = { ...weatherTool, execute: async () => 'Sunny' };
    const events = await collect(
      run({
        engine,
        input: input([
          {
            name: 'showMap',
            description: 'Show a map',
            parameters: { type: 'object' },
          },
        ]),
        localTools: [local],
      }),
    );

    expect(
      events.filter((event) => event.type === EventType.TOOL_CALL_START),
    ).toHaveLength(2);
    expect(
      events.some((event) => event.type === EventType.TOOL_CALL_RESULT),
    ).toBe(true);
    expect(engine.requests).toHaveLength(1); // the client continues after its tool
  });

  it('sends an unrepairable call back to the model and lets it try again', async () => {
    const engine = scriptedEngine(
      '```tool_call\n{"name": "sendEmail", "arguments": {}}\n```',
      'Sorry, I cannot.',
    );
    const events = await collect(run({ engine, input: input([weatherTool]) }));

    expect(
      events.some((event) => event.type === EventType.TOOL_CALL_START),
    ).toBe(false);
    expect(engine.requests[1]?.messages.at(-1)?.content).toContain(
      'Unknown tool \\"sendEmail\\"',
    );
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });

  it('reads tool sources at the start of the run, and a client tool wins on a name clash', async () => {
    const engine = scriptedEngine(call);
    const fromSource: LocalTool = {
      ...weatherTool,
      execute: async () => 'local',
    };
    const events = await collect(
      run({
        engine,
        input: input([weatherTool]),
        localTools: [{ tools: async () => [fromSource] }],
      }),
    );

    // getWeather is also a client tool, so the run ends for the client instead of running locally.
    expect(
      events.some((event) => event.type === EventType.TOOL_CALL_RESULT),
    ).toBe(false);
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });

  it('skips a failing tool source, reports it, and still answers', async () => {
    const events = await collect(
      run({
        engine: scriptedEngine('Hi.'),
        input: input(),
        localTools: [
          {
            tools: async () => {
              throw new Error('MCP server unreachable');
            },
          },
        ],
      }),
    );

    expect(
      events.find((event) => event.type === EventType.CUSTOM),
    ).toMatchObject({
      name: 'soverius.tool_source_error',
      value: { message: 'MCP server unreachable' },
    });
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });

  it('ends with RUN_ERROR when the engine fails', async () => {
    const engine: Engine = {
      ...scriptedEngine(),
      // eslint-disable-next-line require-yield
      async *generate() {
        throw new Error('GPU lost');
      },
    };
    const events = await collect(run({ engine, input: input() }));
    expect(events.at(-1)).toEqual({
      type: EventType.RUN_ERROR,
      message: 'GPU lost',
    });
  });
});

describe('ToolCalling', () => {
  it("describes the client's and the agent's tools in the system prompt", async () => {
    const engine = scriptedEngine('Hi.');
    await collect(
      run({
        engine,
        input: input([weatherTool]),
        localTools: [
          {
            name: 'getTime',
            description: 'The time',
            execute: async () => '12:00',
          },
        ],
      }),
    );

    const system = engine.requests[0]?.messages[0]?.content ?? '';
    expect(system).toContain('- getWeather: Weather for a city');
    expect(system).toContain('- getTime: The time');
    expect(system).toContain('```tool_call');
  });
});

describe('AgentRun streaming tool calls', () => {
  const tripTool: Tool = {
    name: 'planTrip',
    description: 'Plan a trip',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' }, days: { type: 'integer' } },
      required: ['city'],
    },
  };

  it('sends START and argument deltas while the model is still writing the call', async () => {
    const fragments = [
      '```tool_call\n{"name": "planTrip", "argu',
      'ments": {"city": "Vie',
      'nna", "days": 3',
      '}}\n```',
    ];
    let pulled = 0;
    const engine: Engine = {
      ...scriptedEngine(),
      async *generate() {
        for (const fragment of fragments) {
          pulled++;
          yield { type: 'text' as const, text: fragment };
        }
      },
    };
    // Every event, with the number of fragments the model had written when it was sent.
    const seen: [EventType, string, number][] = [];
    for await (const event of run({ engine, input: input([tripTool]) })) {
      const delta = event.type === EventType.TOOL_CALL_ARGS ? event.delta : '';
      seen.push([event.type, delta, pulled]);
    }

    expect(seen).toEqual([
      [EventType.RUN_STARTED, '', 0],
      [EventType.TOOL_CALL_START, '', 1],
      [EventType.TOOL_CALL_ARGS, '{"city":"Vie', 2],
      [EventType.TOOL_CALL_ARGS, 'nna"', 3],
      [EventType.TOOL_CALL_ARGS, ',"days":3}', 4],
      [EventType.TOOL_CALL_END, '', 4],
      [EventType.RUN_FINISHED, '', 4],
    ]);
  });

  it('needs no correction for a valid call', async () => {
    const events = await collect(
      run({ engine: scriptedEngine(call), input: input([weatherTool]) }),
    );

    expect(types(events)).not.toContain(EventType.MESSAGES_SNAPSHOT);
    expect(types(events)).not.toContain(EventType.CUSTOM);
    expect(argsDeltas(events).length).toBeGreaterThan(1);
    expect(await clientToolCalls(events)).toEqual([
      'getWeather({"city":"Vienna"})',
    ]);
  });

  it('replaces streamed arguments that repair changed, before TOOL_CALL_END', async () => {
    const events = await collect(
      run({
        engine: scriptedEngine(
          '```tool_call\n{"name": "plan_trip", "arguments": {"city": "Vienna", "days": "3"}}\n```',
        ),
        input: input([tripTool]),
      }),
    );

    expect(
      events.find((event) => event.type === EventType.TOOL_CALL_START),
    ).toMatchObject({ toolCallName: 'planTrip' });
    expect(argsDeltas(events).join('')).toBe('{"city":"Vienna","days":"3"');
    expect(types(events).slice(-4)).toEqual([
      EventType.CUSTOM,
      EventType.MESSAGES_SNAPSHOT,
      EventType.TOOL_CALL_END,
      EventType.RUN_FINISHED,
    ]);
    expect(events.at(-4)).toMatchObject({
      name: 'soverius.tool_repair',
      value: { steps: ['name', 'coerce'] },
    });
    expect(await clientToolCalls(events)).toEqual([
      'planTrip({"city":"Vienna","days":3})',
    ]);
  });

  it('streams a call with broken JSON and ends with the repaired arguments', async () => {
    const events = await collect(
      run({
        engine: scriptedEngine(
          "```tool_call\n{name: 'getWeather', arguments: {city: 'Vienna',}\n```",
        ),
        input: input([weatherTool]),
      }),
    );

    expect(argsDeltas(events).length).toBeGreaterThan(1);
    expect(await clientToolCalls(events)).toEqual([
      'getWeather({"city":"Vienna"})',
    ]);
  });

  it('takes a streamed call back when it cannot be repaired, and tells the model', async () => {
    const engine = scriptedEngine(
      '```tool_call\n{"name": "getWeather", "arguments": {"town": "Vienna"}}\n```',
      'not json', // the answer to the re-ask
      'Sorry.',
    );
    const events = await collect(run({ engine, input: input([weatherTool]) }));

    const calls = types(events).filter((type) => type.startsWith('TOOL_CALL'));
    expect(calls.at(0)).toBe(EventType.TOOL_CALL_START);
    expect(calls.at(-1)).toBe(EventType.TOOL_CALL_END);
    expect(types(events).indexOf(EventType.MESSAGES_SNAPSHOT)).toBe(
      types(events).indexOf(EventType.TOOL_CALL_END) - 1,
    );
    expect(await clientToolCalls(events)).toEqual([]);
    expect(engine.requests[2]?.messages.at(-1)?.content).toContain(
      'Invalid arguments for \\"getWeather\\"',
    );
  });

  it('does not stream a call to an unknown tool', async () => {
    const events = await collect(
      run({
        engine: scriptedEngine(
          '```tool_call\n{"name": "sendEmail", "arguments": {"to": "a@b.c"}}\n```',
          'Sorry.',
        ),
        input: input([weatherTool]),
      }),
    );

    expect(types(events).some((type) => type.startsWith('TOOL_CALL'))).toBe(
      false,
    );
    expect(await clientToolCalls(events)).toEqual([]);
  });

  it('closes and takes back a half-written call when the run is stopped', async () => {
    const abort = new AbortController();
    const engine: Engine = {
      ...scriptedEngine(),
      async *generate() {
        yield {
          type: 'text' as const,
          text: 'Sure. ```tool_call\n{"name": "getWeather", "arguments": {"city": "Vie',
        };
        abort.abort();
        throw new Error('aborted');
      },
    };
    const events = await collect(
      run({ engine, input: input([weatherTool]), signal: abort.signal }),
    );

    expect(types(events).slice(-5)).toEqual([
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.MESSAGES_SNAPSHOT,
      EventType.TOOL_CALL_END,
      EventType.RUN_ERROR,
    ]);
    expect(await clientMessages(events)).toEqual([
      ...input().messages,
      expect.objectContaining({ content: 'Sure. ', toolCalls: [] }),
    ]);
  });

  it('streams two calls in one step, each with its own arguments', async () => {
    const mapTool: Tool = {
      name: 'showMap',
      description: 'Show a map',
      parameters: { type: 'object', properties: { zoom: { type: 'number' } } },
    };
    const events = await collect(
      run({
        engine: scriptedEngine(
          call +
            '\n```tool_call\n{"name": "showMap", "arguments": {"zoom": 4}}\n```',
        ),
        input: input([weatherTool, mapTool]),
      }),
    );

    const starts = events.flatMap((event) =>
      event.type === EventType.TOOL_CALL_START ? [event.toolCallName] : [],
    );
    expect(starts).toEqual(['getWeather', 'showMap']);
    expect(types(events)).not.toContain(EventType.MESSAGES_SNAPSHOT);
    expect(await clientToolCalls(events)).toEqual([
      'getWeather({"city":"Vienna"})',
      'showMap({"zoom":4})',
    ]);
  });

  it('keeps streaming text before and after a call, in one message', async () => {
    const events = await collect(
      run({
        engine: scriptedEngine(`Let me check. ${call} One moment.`),
        input: input([weatherTool]),
      }),
    );

    const order = types(events).filter(
      (type, index, all) => type !== all[index - 1],
    );
    expect(order).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.TOOL_CALL_ARGS, // the closing brace, once the call is repaired
      EventType.TOOL_CALL_END,
      EventType.RUN_FINISHED,
    ]);
    expect(await clientMessages(events)).toEqual([
      ...input().messages,
      expect.objectContaining({
        content: 'Let me check.  One moment.',
        toolCalls: [
          expect.objectContaining({
            function: { name: 'getWeather', arguments: '{"city":"Vienna"}' },
          }),
        ],
      }),
    ]);
  });

  it('starts a call late when its name comes after the arguments', async () => {
    const events = await collect(
      run({
        engine: fragmentEngine(
          '```tool_call\n{"arguments": {"city": "Vienna"}, ',
          '"name": "getWeather"}\n```',
        ),
        input: input([weatherTool]),
      }),
    );

    expect(await clientToolCalls(events)).toEqual([
      'getWeather({"city":"Vienna"})',
    ]);
  });
});

describe('AgentRun stopping', () => {
  const stopped = {
    type: EventType.RUN_ERROR,
    message: 'The run was stopped.',
    code: 'abort',
  };

  it('passes the signal to tool sources and stops after model load', async () => {
    const abort = new AbortController();
    const engine = scriptedEngine('Hi.');
    let seen: AbortSignal | undefined;
    const events = await collect(
      run({
        engine: { ...engine, load: async () => abort.abort() },
        input: input(),
        localTools: [
          {
            tools: async (signal) => {
              seen = signal;
              return [];
            },
          },
        ],
        signal: abort.signal,
      }),
    );

    expect(seen).toBe(abort.signal);
    expect(engine.requests).toHaveLength(0);
    expect(events.at(-1)).toEqual(stopped);
  });

  it('does not repair or run a call when the engine just stops writing on abort', async () => {
    const abort = new AbortController();
    const execute = vi.fn(async () => 'Sunny');
    const engine: Engine = {
      ...scriptedEngine(),
      async *generate() {
        yield {
          type: 'text' as const,
          text: '```tool_call\n{"name": "getWeather", "arguments": {"city": "Vienna"}',
        };
        abort.abort(); // this engine ends its stream without throwing
      },
    };
    const events = await collect(
      run({
        engine,
        input: input(),
        localTools: [{ ...weatherTool, execute }],
        signal: abort.signal,
      }),
    );

    expect(execute).not.toHaveBeenCalled();
    expect(types(events).slice(-3)).toEqual([
      EventType.MESSAGES_SNAPSHOT,
      EventType.TOOL_CALL_END,
      EventType.RUN_ERROR,
    ]);
    expect(events.at(-1)).toEqual(stopped);
    expect(await clientToolCalls(events)).toEqual([]);
  });

  it('does not run a local tool when the run is stopped during repair', async () => {
    const abort = new AbortController();
    const execute = vi.fn(async () => 'Sunny');
    const events = await collect(
      run({
        engine: scriptedEngine(
          '```tool_call\n{"name": "getWeather", "arguments": {}}\n```',
        ),
        input: input(),
        localTools: [{ ...weatherTool, execute }],
        repairHook: () => {
          abort.abort();
          return { name: 'getWeather', arguments: { city: 'Graz' } };
        },
        signal: abort.signal,
      }),
    );

    expect(execute).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual(stopped);
    expect(await clientToolCalls(events)).toEqual([]);
  });
});

describe('AgentRun re-ask', () => {
  const missingCity =
    '```tool_call\n{"name": "getWeather", "arguments": {}}\n```';

  it('shows the model its call and the schema', async () => {
    const engine = scriptedEngine(missingCity, '{"city": "Graz"}');
    await collect(run({ engine, input: input([weatherTool]) }));

    const [call, request] = engine.requests[1]?.messages.slice(-2) ?? [];
    expect(call).toEqual({ role: 'assistant', content: missingCity });
    expect(request?.content).toContain('arguments.city is required');
    expect(request?.content).toContain(JSON.stringify(weatherTool.parameters));
  });

  it.each([
    [
      'a tool_call block',
      '```tool_call\n{"name": "getWeather", "arguments": {"city": "Graz"}}\n```',
    ],
    ['a whole call', '{"name": "getWeather", "arguments": {"city": "Graz"}}'],
  ])('accepts %s as the answer', async (_, answer) => {
    const events = await collect(
      run({
        engine: scriptedEngine(missingCity, answer),
        input: input([weatherTool]),
      }),
    );

    expect(await clientToolCalls(events)).toEqual([
      'getWeather({"city":"Graz"})',
    ]);
  });

  it.each([
    ['the re-ask', undefined],
    [
      'the repair hook',
      () => {
        throw new Error('hook failed');
      },
    ],
  ])('tells the model the error when %s throws', async (_, repairHook) => {
    const base = scriptedEngine();
    const engine: Engine & { requests: GenerateRequest[] } = {
      ...base,
      supportsConstraint: true,
      async *generate(request) {
        base.requests.push(request);
        if (request.constraint) throw new Error('Unsupported schema');
        yield {
          type: 'text' as const,
          text: base.requests.length === 1 ? missingCity : 'Sorry.',
        };
      },
    };
    const events = await collect(
      run({
        engine,
        input: input([weatherTool]),
        ...(repairHook ? { repairHook } : {}),
      }),
    );

    expect(engine.requests.at(-1)?.messages.at(-1)?.content).toContain(
      'arguments.city is required',
    );
    expect(await clientToolCalls(events)).toEqual([]);
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });
});

describe('AgentRun cut-off tool call', () => {
  it('does not run a call the output ended in, and tells the model', async () => {
    const execute = vi.fn(async () => 'Sunny');
    const engine = scriptedEngine(
      // Valid JSON after repair, but the block was never closed (for example a token limit).
      '```tool_call\n{"name": "getWeather", "arguments": {"city": "Vienna"',
      'Sorry.',
    );
    const events = await collect(
      run({
        engine,
        input: input(),
        localTools: [{ ...weatherTool, execute }],
      }),
    );

    expect(execute).not.toHaveBeenCalled();
    expect(engine.requests[1]?.messages.at(-1)?.content).toContain('cut off');
    expect(
      types(events).filter((type) => type.startsWith('TOOL_CALL')),
    ).toEqual(
      expect.arrayContaining([
        EventType.TOOL_CALL_START,
        EventType.TOOL_CALL_END,
      ]),
    );
    expect(await clientToolCalls(events)).toEqual([]);
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });
});

describe('AgentRun compaction', () => {
  const call = '```tool_call\n{"name": "search", "arguments": {}}\n```';
  const search: LocalTool = {
    name: 'search',
    description: 'Searches',
    parameters: { type: 'object', properties: {} },
    execute: async () => 'r'.repeat(1500),
  };
  const compactions = (events: AgUiEvent[]) =>
    events.flatMap((event) =>
      event.type === EventType.CUSTOM && event.name === 'soverius.compaction'
        ? [event.value as CompactionStatus]
        : [],
    );

  it('cuts an old tool result in a run that calls tools again and again', async () => {
    // Two results of 500 tokens fit into 90 % of 1300 only when the first one is cut.
    const engine = {
      ...scriptedEngine(call, call, 'Done.'),
      contextWindowSize: 1300,
    };

    const events = await collect(
      run({
        engine,
        input: input(),
        localTools: [search],
        compaction: new SummaryCompaction(),
      }),
    );

    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
    expect(compactions(events)).toEqual([
      expect.objectContaining({ status: 'done', shortened: 1 }),
    ]);
    // The third model call got the first result cut and the second one whole.
    const third = engine.requests[2]?.messages.map((m) => m.content.length);
    expect(third?.at(-3)).toBeLessThan(400);
    expect(third?.at(-1)).toBeGreaterThan(1500);
  });

  it('asks a compaction of your own before every model call, with the whole chat', async () => {
    const requests: CompactionRequest[] = [];
    /** Sends the system prompt and the newest message only. */
    class NewestOnly implements Compaction {
      async compact(request: CompactionRequest) {
        requests.push({ ...request, messages: [...request.messages] });
        request.report({
          status: 'done',
          tokensBefore: request.messages.length,
          tokensAfter: 2,
          contextWindowSize: 0,
          summarized: 0,
          shortened: 0,
          dropped: request.messages.length - 2,
        });
        return [...request.messages.slice(0, 1), ...request.messages.slice(-1)];
      }
    }
    const engine = scriptedEngine(call, 'Done.');

    const events = await collect(
      run({
        engine,
        input: input(),
        localTools: [search],
        compaction: new NewestOnly(),
      }),
    );

    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
    expect(requests.map((request) => request.threadId)).toEqual([
      'thread',
      'thread',
    ]);
    // The second call gets what the first one left out again, and what the run added.
    expect(requests.map((request) => request.messages.length)).toEqual([2, 4]);
    expect(requests[1]?.messages.map((message) => message.source?.id)).toEqual([
      undefined,
      '1',
      undefined,
      undefined,
    ]);
    // The engine gets what the compaction returned, as plain chat messages.
    expect(engine.requests[1]?.messages).toEqual([
      { role: 'system', content: expect.stringContaining('search') },
      { role: 'user', content: expect.stringContaining('tool_result') },
    ]);
    expect(compactions(events).map((status) => status.status)).toEqual([
      'done',
      'done',
    ]);
  });
});
