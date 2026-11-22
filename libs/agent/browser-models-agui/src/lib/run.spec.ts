import {
  EventType,
  type Event as AgUiEvent,
  type RunAgentInput,
} from '@ag-ui/core';
import type {
  Engine,
  EnginePart,
  GenerateRequest,
} from '@soverius-ai/browser-models';
import type { CompactionRequest } from './compaction.ts';
import { AgentEvents } from './events.ts';
import { AgentRun, type RunOptions } from './run.ts';
import type { CheckedCall, RunTools, Tools } from './tools.ts';

/** An engine that replies with scripted parts and records what it was asked. */
function engine(
  ...replies: (string | readonly EnginePart[])[]
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
      if (typeof reply === 'string') yield { type: 'text', text: reply };
      else yield* reply;
    },
  };
}

function input(overrides: Partial<RunAgentInput> = {}): RunAgentInput {
  return {
    threadId: 'thread',
    runId: 'run',
    messages: [{ id: '1', role: 'user', content: 'Hi' }],
    tools: [],
    context: [],
    ...overrides,
  };
}

async function events(options: RunOptions): Promise<AgUiEvent[]> {
  const result: AgUiEvent[] = [];
  for await (const event of new AgentRun(options).events()) result.push(event);
  return result;
}

const text = (all: AgUiEvent[]) =>
  all
    .flatMap((event) =>
      event.type === EventType.TEXT_MESSAGE_CONTENT ? [event.delta] : [],
    )
    .join('');

const call = '```tool_call\n{"name": "lookup", "arguments": {}}\n```';

describe('AgentRun without tools', () => {
  it('streams a text answer', async () => {
    const all = await events({ engine: engine('Hello!'), input: input() });

    expect(all.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(text(all)).toBe('Hello!');
  });

  it("does not offer the client's tools, and drops a call the model writes anyway", async () => {
    const model = engine(`Let me look. ${call}`);
    const all = await events({
      engine: model,
      input: input({
        tools: [{ name: 'lookup', description: 'Looks up', parameters: {} }],
      }),
    });

    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]?.messages).toEqual([
      { role: 'user', content: 'Hi' },
    ]);
    expect(text(all)).toBe('Let me look. ');
    expect(all.some((event) => event.type === EventType.TOOL_CALL_START)).toBe(
      false,
    );
    expect(all.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });

  it('streams thinking as reasoning events before the answer', async () => {
    const all = await events({
      engine: engine('<think>Hmm.</think>Yes.'),
      input: input(),
    });

    expect(all.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.REASONING_START,
      EventType.REASONING_MESSAGE_START,
      EventType.REASONING_MESSAGE_CONTENT,
      EventType.REASONING_MESSAGE_END,
      EventType.REASONING_END,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
  });

  it('reports model loading as an AG-UI activity, typed by AgentEvents', async () => {
    const loading: Engine = {
      ...engine('Hi'),
      async load({ onProgress } = {}) {
        onProgress?.(0.5);
        onProgress?.(1);
      },
    };
    const all = await events({ engine: loading, input: input() });

    expect(
      all.flatMap((event) => AgentEvents.modelActivity(event) ?? []),
    ).toEqual([
      { engineId: 'scripted', status: 'loading', progress: 0.5 },
      { engineId: 'scripted', status: 'loading', progress: 1 },
      { engineId: 'scripted', status: 'ready', progress: 1 },
    ]);
  });

  it('ends with RUN_ERROR and code abort when the run is stopped', async () => {
    const abort = new AbortController();
    abort.abort();
    const all = await events({
      engine: engine('Hi'),
      input: input(),
      signal: abort.signal,
    });

    expect(all.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      code: 'abort',
    });
  });

  it('ends with RUN_ERROR when the engine fails', async () => {
    const failing: Engine = {
      ...engine(),
      // eslint-disable-next-line require-yield
      async *generate() {
        throw new Error('GPU lost');
      },
    };
    const all = await events({ engine: failing, input: input() });

    expect(all.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      message: 'GPU lost',
    });
  });
});

describe('AgentRun with tools of your own', () => {
  /** Tools whose calls are always valid; `lookup` runs in the agent, other tools in the client. */
  class FakeTools implements Tools {
    readonly checked: string[] = [];

    async start(): Promise<RunTools> {
      const checked = this.checked;
      return {
        tools: [{ name: 'lookup', description: 'Looks up' }],
        instructions: 'Call lookup.',
        errors: ['The MCP server is down.'],
        maxSteps: 3,
        readPartial: () => undefined,
        async check(raw): Promise<CheckedCall> {
          checked.push(raw);
          const { name } = JSON.parse(raw) as { name: string };
          return { ok: true, call: { name, arguments: {} }, steps: [] };
        },
        run: (toolCall) =>
          toolCall.name === 'lookup' ? Promise.resolve('found it') : undefined,
      };
    }
  }

  it('offers the tools, runs the local ones and continues with their result', async () => {
    const tools = new FakeTools();
    const model = engine(call, 'It is there.');
    const all = await events({ engine: model, input: input(), tools });

    expect(model.requests[0]?.messages[0]).toEqual({
      role: 'system',
      content: 'Call lookup.',
    });
    expect(tools.checked).toEqual(['{"name": "lookup", "arguments": {}}']);
    expect(
      all.flatMap((event) =>
        event.type === EventType.TOOL_CALL_RESULT ? [event.content] : [],
      ),
    ).toEqual(['found it']);
    expect(model.requests[1]?.messages.at(-1)?.content).toContain('found it');
    expect(text(all)).toBe('It is there.');
    expect(
      all.flatMap((event) => AgentEvents.toolSourceError(event) ?? []),
    ).toEqual([{ message: 'The MCP server is down.' }]);
  });

  it("ends the run at a call to a client's tool", async () => {
    const model = engine(
      '```tool_call\n{"name": "showChart", "arguments": {}}\n```',
    );
    const all = await events({
      engine: model,
      input: input(),
      tools: new FakeTools(),
    });

    expect(model.requests).toHaveLength(1);
    expect(all.at(-1)?.type).toBe(EventType.RUN_FINISHED);
    expect(
      all.flatMap((event) =>
        event.type === EventType.TOOL_CALL_START ? [event.toolCallName] : [],
      ),
    ).toEqual(['showChart']);
  });
});

describe('AgentRun compaction', () => {
  it('hands the compaction what the engine counted for the last call', async () => {
    const requests: CompactionRequest[] = [];
    const model = engine(
      [
        { type: 'text', text: call },
        { type: 'finish', reason: 'stop', usage: { totalTokens: 100 } },
      ],
      'Done.',
    );
    class FakeTools implements Tools {
      async start(): Promise<RunTools> {
        return {
          tools: [{ name: 'lookup', description: 'Looks up' }],
          instructions: undefined,
          errors: [],
          maxSteps: 2,
          readPartial: () => undefined,
          check: async () => ({
            ok: true,
            call: { name: 'lookup', arguments: {} },
            steps: [],
          }),
          run: async () => 'x',
        };
      }
    }

    await events({
      engine: model,
      input: input(),
      tools: new FakeTools(),
      compaction: {
        compact: async (request) => {
          requests.push(request);
          return request.messages;
        },
      },
    });

    expect(requests[0]?.lastCall).toBeUndefined();
    expect(requests[1]?.lastCall).toEqual({
      tokens: 100,
      // 'Hi' and the call the model wrote.
      characters: 2 + '{"name": "lookup", "arguments": {}}'.length,
    });
  });

  it('fails the run when the compaction fails', async () => {
    const all = await events({
      engine: engine('Hello'),
      input: input(),
      compaction: {
        compact: async () => {
          throw new Error('No room.');
        },
      },
    });

    expect(all.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      message: 'No room.',
    });
  });
});
