import {
  EventType,
  type BaseEvent,
  type TextMessageContentEvent,
} from '@ag-ui/core';
import { firstValueFrom, toArray } from 'rxjs';
import { BrowserModelsAgent } from './agent.ts';
import type { Engine } from '@soverius-ai/browser-models';

function engineSaying(text: string): Engine {
  return {
    id: text,
    supportsConstraint: false,
    availability: async () => 'available',
    load: async () => undefined,
    unload: async () => undefined,
    async *generate() {
      yield { type: 'text' as const, text };
    },
  };
}

const runInput = (forwardedProps?: unknown) => ({
  threadId: 't',
  runId: 'r',
  messages: [{ id: '1', role: 'user' as const, content: 'Hi' }],
  tools: [],
  context: [],
  forwardedProps,
});

async function textOf(events: BaseEvent[]): Promise<string> {
  return events
    .flatMap((event) =>
      event.type === EventType.TEXT_MESSAGE_CONTENT
        ? [(event as TextMessageContentEvent).delta]
        : [],
    )
    .join('');
}

describe('BrowserModelsAgent', () => {
  const agent = new BrowserModelsAgent({
    models: {
      nano: engineSaying('from nano'),
      qwen: engineSaying('from qwen'),
    },
    defaultModel: 'nano',
  });

  it('uses the default model', async () => {
    const events = await firstValueFrom(agent.run(runInput()).pipe(toArray()));
    expect(await textOf(events)).toBe('from nano');
  });

  it('uses the model a run picks', async () => {
    const events = await firstValueFrom(
      agent.run(runInput({ soverius: { model: 'qwen' } })).pipe(toArray()),
    );
    expect(await textOf(events)).toBe('from qwen');
  });

  it('fails a run that picks an unknown model, without falling back', async () => {
    const events = await firstValueFrom(
      agent.run(runInput({ soverius: { model: 'gpt' } })).pipe(toArray()),
    );
    expect(events.at(-1)).toEqual({
      type: EventType.RUN_ERROR,
      message: 'Unknown model "gpt".',
    });
  });

  it('still works after AG-UI clones it', async () => {
    const events = await firstValueFrom(
      agent.clone().run(runInput()).pipe(toArray()),
    );
    expect(await textOf(events)).toBe('from nano');
  });

  it('switches models explicitly, also for clones', async () => {
    const switching = new BrowserModelsAgent({
      models: {
        nano: engineSaying('from nano'),
        qwen: engineSaying('from qwen'),
      },
      defaultModel: 'nano',
    });
    const clone = switching.clone();
    switching.selectModel('qwen');

    expect(switching.selectedModel).toBe('qwen');
    const events = await firstValueFrom(clone.run(runInput()).pipe(toArray()));
    expect(await textOf(events)).toBe('from qwen');
  });

  it('only accepts registered model ids', () => {
    // @ts-expect-error 'gpt' is not one of the registered models
    expect(() => agent.selectModel('gpt')).toThrow('Unknown model "gpt".');
  });

  it.each(['the agent', 'a clone'])(
    'stops a running run with abortRun() on %s',
    async (which) => {
      let signal: AbortSignal | undefined;
      const waiting: Engine = {
        ...engineSaying('x'),
        // Generates until it is aborted.
        async *generate(request) {
          signal = request.signal;
          yield { type: 'text' as const, text: 'a' };
          await new Promise((_, reject) =>
            signal?.addEventListener('abort', () => reject(signal?.reason)),
          );
        },
      };
      const original = new BrowserModelsAgent({
        models: { waiting },
        defaultModel: 'waiting',
      });
      const running = which === 'a clone' ? original.clone() : original;
      const events: BaseEvent[] = [];
      const ended = new Promise<void>((resolve) =>
        running.run(runInput()).subscribe({
          next: (event) => events.push(event),
          error: () => resolve(),
          complete: () => resolve(),
        }),
      );
      await vi.waitFor(async () => expect(await textOf(events)).toBe('a'));

      running.abortRun();
      await ended;
      expect(signal?.aborted).toBe(true);
    },
  );

  it('lists model ids and engines', () => {
    expect(agent.modelIds).toEqual(['nano', 'qwen']);
    expect(agent.engine('qwen').id).toBe('from qwen');
  });

  it('rejects a default model that is not registered', () => {
    const models: Record<string, Engine> = { nano: engineSaying('x') };
    expect(
      () => new BrowserModelsAgent({ models, defaultModel: 'missing' }),
    ).toThrow('defaultModel "missing" is not one of the registered models.');
  });
});

describe('BrowserModelsAgent.connectDevtools', () => {
  it('posts every agent event to the window for the debugger', async () => {
    const agent = new BrowserModelsAgent({
      agentId: 'weather',
      models: { nano: engineSaying('hello') },
      defaultModel: 'nano',
    });
    const posted: unknown[] = [];
    const target = {
      location: { origin: 'http://localhost' },
      postMessage: (message: unknown) => posted.push(message),
    } as unknown as Window;

    const stop = agent.connectDevtools(target);
    await agent.runAgent();
    stop();

    expect(posted[0]).toMatchObject({
      source: 'soverius-ai/devtools',
      agentId: 'weather',
      event: { type: EventType.RUN_STARTED },
    });
  });

  it('does nothing without a window, for example during server-side rendering', () => {
    const agent = new BrowserModelsAgent({
      models: { nano: engineSaying('hi') },
      defaultModel: 'nano',
    });
    expect(() => agent.connectDevtools()()).not.toThrow();
  });
});

describe('BrowserModelsAgent compaction', () => {
  /** A conversation too long for a context of 1000 tokens. */
  const longInput = () => ({
    threadId: 't',
    runId: 'r',
    messages: [
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `m${i}`,
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `${i} ${'x'.repeat(300)}`,
      })),
      { id: 'last', role: 'user' as const, content: 'And now?' },
    ],
    tools: [],
    context: [],
  });

  function countingEngine(): Engine & { calls: number } {
    return {
      ...engineSaying('text'),
      contextWindowSize: 1000,
      calls: 0,
      async *generate() {
        this.calls++;
        yield { type: 'text' as const, text: 'text' };
      },
    };
  }

  const compactions = (events: BaseEvent[]) =>
    events.filter(
      (event) =>
        event.type === EventType.CUSTOM &&
        (event as { name?: string }).name === 'soverius.compaction',
    ).length;

  it('summarizes a long thread once, also across the clones a client makes', async () => {
    const engine = countingEngine();
    const agent = new BrowserModelsAgent({
      models: { engine },
      defaultModel: 'engine',
    });

    const first = await firstValueFrom(
      agent.clone().run(longInput()).pipe(toArray()),
    );
    expect(compactions(first)).toBe(2); // summarizing, done
    expect(engine.calls).toBe(2); // the summary and the answer

    // The next run of the thread, with two more short messages: the summary is still there.
    const next = longInput();
    next.messages.push(
      { id: 'a', role: 'assistant', content: 'text' },
      { id: 'q', role: 'user', content: 'Thanks' },
    );
    const second = await firstValueFrom(
      agent.clone().run(next).pipe(toArray()),
    );
    expect(compactions(second)).toBe(0);
    expect(engine.calls).toBe(3);
  });

  it('can be switched off', async () => {
    const engine = countingEngine();
    const agent = new BrowserModelsAgent({
      models: { engine },
      defaultModel: 'engine',
      compaction: false,
    });

    const events = await firstValueFrom(agent.run(longInput()).pipe(toArray()));

    expect(compactions(events)).toBe(0);
    expect(engine.calls).toBe(1);
  });
});
