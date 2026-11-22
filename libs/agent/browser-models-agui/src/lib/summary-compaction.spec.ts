import type { Message } from '@ag-ui/core';
import type { CompactionStatus, LastCall } from './compaction.ts';
import type {
  ChatMessage,
  Engine,
  GenerateRequest,
} from '@soverius-ai/browser-models';
import { buildChatMessages, toolResultBlock } from './prompt.ts';
import { SummaryCompaction } from './summary-compaction.ts';

/** An engine with a context of `contextWindowSize` tokens that replies with scripted text. */
function engine(
  contextWindowSize: number | undefined,
  ...replies: string[]
): Engine & { requests: GenerateRequest[] } {
  const requests: GenerateRequest[] = [];
  return {
    id: 'scripted',
    supportsConstraint: false,
    contextWindowSize,
    requests,
    availability: async () => 'available',
    load: async () => undefined,
    unload: async () => undefined,
    async *generate(request) {
      requests.push({ ...request, messages: [...request.messages] });
      yield { type: 'text', text: replies[requests.length - 1] ?? '' };
    },
  };
}

/**
 * A conversation of `turns` question and answer pairs, then a question. Every question and
 * answer has 300 characters: 104 estimated tokens.
 */
function conversation(turns: number, question = 'And now?'): Message[] {
  const messages: Message[] = [
    { id: 'system', role: 'system', content: 'Be brief.' },
  ];
  for (let turn = 1; turn <= turns; turn++) {
    messages.push(
      { id: `q${turn}`, role: 'user', content: `Q${turn} `.padEnd(300, 'x') },
      {
        id: `a${turn}`,
        role: 'assistant',
        content: `A${turn} `.padEnd(300, 'y'),
      },
    );
  }
  messages.push({ id: 'last', role: 'user', content: question });
  return messages;
}

/** One model call of a run: the client's conversation and what the run added to it. */
interface Call {
  readonly messages: Message[];
  readonly engine: Engine;
  readonly added?: ChatMessage[];
  readonly signal?: AbortSignal;
  readonly lastCall?: LastCall;
}

/** Compacts the prompt of `call`. Returns what the model gets and what was reported. */
async function compact(
  compaction: SummaryCompaction,
  call: Call,
): Promise<{ chat: readonly ChatMessage[]; reports: CompactionStatus[] }> {
  const reports: CompactionStatus[] = [];
  const chat = await compaction.compact({
    threadId: 'thread',
    messages: [...buildChatMessages(call.messages, []), ...(call.added ?? [])],
    engine: call.engine,
    signal: call.signal ?? new AbortController().signal,
    report: (status) => reports.push(status),
    ...(call.lastCall ? { lastCall: call.lastCall } : {}),
  });
  return { chat, reports };
}

/** The chat as `role: start of the content`. */
function contents(chat: readonly ChatMessage[]): string[] {
  return chat.map(
    (message) => `${message.role}: ${message.content.slice(0, 4).trim()}`,
  );
}

/** What the model was asked to summarize in its `index`-th call. */
function summaryRequest(model: { requests: GenerateRequest[] }, index = 0) {
  return model.requests[index]?.messages.at(-1)?.content ?? '';
}

describe('SummaryCompaction', () => {
  it('leaves a chat alone that fits', async () => {
    const model = engine(4096);
    const { chat, reports } = await compact(new SummaryCompaction(), {
      messages: conversation(3),
      engine: model,
    });

    expect(reports).toEqual([]);
    expect(chat).toHaveLength(8);
    expect(model.requests).toHaveLength(0);
  });

  it('does nothing for an engine that does not know its context size', async () => {
    const { chat, reports } = await compact(new SummaryCompaction(), {
      messages: conversation(50),
      engine: engine(undefined),
    });

    expect(reports).toEqual([]);
    expect(chat).toHaveLength(102);
  });

  it('leaves a sliding window to WebLLM, which reports it as -1', async () => {
    const model = engine(-1);
    const { chat, reports } = await compact(new SummaryCompaction(), {
      messages: conversation(50),
      engine: model,
    });

    expect(reports).toEqual([]);
    expect(chat).toHaveLength(102);
    expect(model.requests).toHaveLength(0);
  });

  it('keeps the newest turns word for word and summarizes the older ones', async () => {
    // 36 messages of 104 tokens are more than 90 % of 4000. A quarter of the context, 1000
    // tokens, stays: the last five turns and the question.
    const model = engine(4000, '<think>hm</think>Goal: x. Facts: y.');
    const { chat, reports } = await compact(new SummaryCompaction(), {
      messages: conversation(18),
      engine: model,
    });

    expect(contents(chat)).toEqual([
      'system: Be b',
      'user: Q14',
      'assistant: A14',
      'user: Q15',
      'assistant: A15',
      'user: Q16',
      'assistant: A16',
      'user: Q17',
      'assistant: A17',
      'user: Q18',
      'assistant: A18',
      'user: And',
    ]);
    expect(chat[0]?.content).toBe(
      'Be brief.\n\nThe conversation before this point was compacted into this summary:\n<summary>\nGoal: x. Facts: y.\n</summary>',
    );
    expect(reports).toEqual([
      { status: 'summarizing', tokens: 3758, contextWindowSize: 4000 },
      {
        status: 'done',
        tokensBefore: 3758,
        tokensAfter: 1091,
        contextWindowSize: 4000,
        summarized: 26,
        shortened: 0,
        dropped: 0,
      },
    ]);
  });

  it('puts the summary after the tool descriptions, at the end of the system prompt', async () => {
    const model = engine(4000, 'Summary.');
    const reports: CompactionStatus[] = [];
    const chat = await new SummaryCompaction().compact({
      threadId: 'thread',
      messages: buildChatMessages(
        conversation(18),
        [],
        'You can call tools. Available tools: search.',
      ),
      engine: model,
      signal: new AbortController().signal,
      report: (status) => reports.push(status),
    });

    expect(chat[0]?.content).toMatch(
      /^Be brief\.\n\nYou can call tools\..*<summary>\nSummary\.\n<\/summary>$/s,
    );
  });

  it('gives the model the older turns as text, with a format and a size for the summary', async () => {
    const model = engine(4000, 'Summary.');
    await compact(new SummaryCompaction(), {
      messages: conversation(18),
      engine: model,
    });

    const request = summaryRequest(model);
    expect(request).toMatch(/^<conversation>\n\[User\]: Q1 x/);
    expect(request).toContain('[Assistant]: A13 y');
    expect(request).not.toContain('Q14'); // stays word for word
    expect(request).toContain('Use at most 130 words and this format:');
    expect(request).toContain('Goal: what the user wants');
    expect(model.requests[0]?.messages[0]).toEqual({
      role: 'system',
      content: expect.stringContaining('Do not continue the conversation'),
    });
  });

  it('summarizes tool calls and their results as text too', async () => {
    const model = engine(4000, 'Summary.');
    const messages = conversation(18);
    messages.splice(
      2,
      1,
      {
        id: 'call',
        role: 'assistant',
        toolCalls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'search', arguments: '{"q":"x"}' },
          },
        ],
      },
      {
        id: 'result',
        role: 'tool',
        toolCallId: 'c1',
        content: 'r'.repeat(900),
      },
    );
    await compact(new SummaryCompaction(), { messages, engine: model });

    const request = summaryRequest(model);
    expect(request).toContain('[Assistant tool call]: search({"q":"x"})');
    // One message gives at most 5 % of the context to the summary: 600 characters.
    expect(request).toContain(`[Tool result]: ${'r'.repeat(600)}\n`);
  });

  it('keeps the summary for the next model calls of the thread', async () => {
    const compaction = new SummaryCompaction();
    const model = engine(4000, 'First summary.');
    const first = conversation(18);
    await compact(compaction, { messages: first, engine: model });

    // The client still sends the whole conversation, with one more turn.
    const next: Message[] = [
      ...first,
      { id: 'a19', role: 'assistant', content: 'A19 short' },
      { id: 'last2', role: 'user', content: 'Thanks. More?' },
    ];
    const { chat, reports } = await compact(compaction, {
      messages: next,
      engine: model,
    });

    expect(reports).toEqual([]);
    expect(model.requests).toHaveLength(1); // no second summary
    expect(chat[0]?.content).toContain('First summary.');
    expect(contents(chat).slice(1, 3)).toEqual(['user: Q14', 'assistant: A14']);
    expect(contents(chat).slice(-2)).toEqual(['assistant: A19', 'user: Than']);
  });

  it('updates the summary with the turns since the last one', async () => {
    const compaction = new SummaryCompaction();
    const model = engine(4000, 'First summary.', 'Second summary.');
    const first = conversation(18);
    await compact(compaction, { messages: first, engine: model });

    const next = [...first];
    for (let turn = 19; turn <= 34; turn++) {
      next.push(
        { id: `a${turn}`, role: 'assistant', content: 'y'.repeat(300) },
        { id: `q${turn}`, role: 'user', content: 'x'.repeat(300) },
      );
    }
    const { chat } = await compact(compaction, {
      messages: next,
      engine: model,
    });

    const request = summaryRequest(model, 1);
    expect(request).toContain(
      '<previous-summary>\nFirst summary.\n</previous-summary>',
    );
    expect(request).toContain('Update the previous summary');
    expect(request).toContain('[User]: Q14 x'); // was kept, is summarized now
    expect(request).not.toContain('Q1 x'); // in the first summary
    expect(chat[0]?.content).toContain('Second summary.');
    expect(chat[0]?.content).not.toContain('First summary.');
  });

  it('ignores a summary whose first kept message is gone from the thread', async () => {
    const compaction = new SummaryCompaction();
    const model = engine(4000, 'Old summary.');
    await compact(compaction, { messages: conversation(18), engine: model });

    const { chat } = await compact(compaction, {
      messages: [{ id: 'new', role: 'user', content: 'Hello' }],
      engine: model,
    });

    expect(contents(chat)).toEqual(['user: Hell']);
  });

  it('keeps less when the system prompt takes most of the context', async () => {
    // 671 of 1000 tokens are the system prompt: half of what is left for the conversation
    // stays, not a quarter of the context.
    const messages: Message[] = [
      { id: 'system', role: 'system', content: 's'.repeat(2000) },
    ];
    for (let turn = 1; turn <= 4; turn++) {
      messages.push(
        { id: `q${turn}`, role: 'user', content: `Q${turn} `.padEnd(150, 'x') },
        {
          id: `a${turn}`,
          role: 'assistant',
          content: `A${turn} `.padEnd(150, 'y'),
        },
      );
    }
    messages.push({ id: 'last', role: 'user', content: 'And now?' });

    const { chat } = await compact(new SummaryCompaction(), {
      messages,
      engine: engine(1000, 'Summary.'),
    });

    expect(contents(chat)).toEqual([
      'system: ssss',
      'user: Q4 x',
      'assistant: A4 y',
      'user: And',
    ]);
  });

  it('leaves the older turns out when it may not summarize', async () => {
    const compaction = new SummaryCompaction({ summarize: false });
    const model = engine(4000);
    const call = { messages: conversation(18), engine: model };

    const { chat, reports } = await compact(compaction, call);

    expect(model.requests).toHaveLength(0);
    expect(contents(chat).slice(0, 2)).toEqual(['system: Be b', 'user: Q14']);
    expect(chat).toHaveLength(12);
    expect(reports).toEqual([
      expect.objectContaining({ status: 'done', summarized: 0, dropped: 26 }),
    ]);

    // The next model call gets the same chat, and nothing is reported again.
    const next = await compact(compaction, call);
    expect(next.chat).toEqual(chat);
    expect(next.reports).toEqual([]);
  });

  it('never leaves out the current turn, also when it is too large by itself', async () => {
    const { chat, reports } = await compact(
      new SummaryCompaction({ summarize: false }),
      { messages: conversation(1, 'q'.repeat(3000)), engine: engine(1000) },
    );

    expect(reports.at(-1)).toMatchObject({ dropped: 2 });
    expect(chat.at(-1)?.content).toBe('q'.repeat(3000));
    expect(chat).toHaveLength(2); // the system prompt and the question
  });

  it('does not call the model to summarize a few short messages', async () => {
    const model = engine(1000, 'Summary.');
    const { chat, reports } = await compact(new SummaryCompaction(), {
      messages: [
        { id: '1', role: 'user', content: 'Hi' },
        { id: '2', role: 'assistant', content: 'Hello' },
        { id: '3', role: 'user', content: 'q'.repeat(3000) },
      ],
      engine: model,
    });

    expect(reports).toEqual([]);
    expect(model.requests).toHaveLength(0);
    expect(chat).toHaveLength(3); // nothing is left out either
  });

  it('leaves the older turns out when the model fails to summarize, and does not ask it again', async () => {
    let calls = 0;
    const model: Engine = {
      ...engine(4000),
      // eslint-disable-next-line require-yield
      async *generate() {
        calls++;
        throw new Error('GPU lost');
      },
    };
    const compaction = new SummaryCompaction();
    const call = { messages: conversation(18), engine: model };

    const { chat, reports } = await compact(compaction, call);

    expect(reports.at(-1)).toMatchObject({ summarized: 0, dropped: 26 });
    expect(chat.at(-1)?.content).toBe('And now?');

    const next = await compact(compaction, call);
    expect(next.chat).toEqual(chat);
    expect(calls).toBe(1);
  });

  it('stops when the run is stopped while the model summarizes', async () => {
    const abort = new AbortController();
    const model: Engine = {
      ...engine(4000),
      // eslint-disable-next-line require-yield
      async *generate() {
        abort.abort();
        throw new DOMException('stopped', 'AbortError');
      },
    };

    await expect(
      compact(new SummaryCompaction(), {
        messages: conversation(18),
        engine: model,
        signal: abort.signal,
      }),
    ).rejects.toThrow('stopped');
  });

  it('sends a summary request that fits the context itself', async () => {
    // 78 older messages do not fit into 1000 tokens: the oldest are not summarized.
    const model = engine(1000, 'Summary.');
    await compact(new SummaryCompaction(), {
      messages: conversation(40),
      engine: model,
    });

    const request = summaryRequest(model);
    expect(request.length).toBeLessThanOrEqual(1000 * 3);
    expect(request).toContain('[Assistant]: A39 y'); // the newest of the older turns stay
    expect(request).not.toContain('Q1 x');
    // One message gives at most 5 % of the context: 150 characters.
    expect(request).toContain(`[User]: ${'Q39 '.padEnd(150, 'x')}\n`);
  });

  it('cuts old tool results before the newest one', async () => {
    const { chat, reports } = await compact(new SummaryCompaction(), {
      messages: conversation(0, 'Look it up.'),
      engine: engine(1000),
      added: [
        { role: 'assistant', content: 'call 1' },
        { role: 'user', content: toolResultBlock('search', 'a'.repeat(1500)) },
        { role: 'assistant', content: 'call 2' },
        { role: 'user', content: toolResultBlock('search', 'b'.repeat(1500)) },
      ],
    });

    const [, , , first, , second] = chat;
    // 2.5 % of the context stay of a cut result: 75 characters.
    expect(first?.content).toBe(
      toolResultBlock('search', 'a'.repeat(75) + '\n… (shortened)'),
    );
    expect(second?.content).toBe(toolResultBlock('search', 'b'.repeat(1500)));
    expect(reports).toEqual([
      expect.objectContaining({ status: 'done', shortened: 1, dropped: 0 }),
    ]);
  });

  it('cuts the newest tool result to the room that is left', async () => {
    const { chat, reports } = await compact(new SummaryCompaction(), {
      messages: conversation(0, 'Look it up.'),
      engine: engine(1000),
      added: [
        { role: 'assistant', content: 'call' },
        { role: 'user', content: toolResultBlock('search', 'a'.repeat(9000)) },
      ],
    });

    const result = chat.at(-1)?.content ?? '';
    expect(result).toContain('… (shortened)');
    expect(result.length).toBeGreaterThan(1500);
    expect(reports.at(-1)).toMatchObject({ shortened: 1, dropped: 0 });
    expect(
      (reports.at(-1) as { tokensAfter: number }).tokensAfter,
    ).toBeLessThanOrEqual(900);
  });

  it('cuts the result of a tool the client ran as well', async () => {
    const messages: Message[] = [
      { id: '1', role: 'user', content: 'Look it up.' },
      {
        id: '2',
        role: 'assistant',
        toolCalls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'search', arguments: '{}' },
          },
        ],
      },
      { id: '3', role: 'tool', toolCallId: 'c1', content: 'a'.repeat(9000) },
    ];

    const { chat, reports } = await compact(new SummaryCompaction(), {
      messages,
      engine: engine(1000),
    });

    expect(chat).toHaveLength(3); // the turn stays whole
    expect(chat.at(-1)?.content).toContain('… (shortened)');
    expect(reports.at(-1)).toMatchObject({ shortened: 1, dropped: 0 });
  });

  it('keeps what the run added when it summarizes in the middle of a run', async () => {
    const { chat } = await compact(new SummaryCompaction(), {
      messages: conversation(18),
      engine: engine(4000, 'Summary.'),
      added: [
        { role: 'assistant', content: 'call' },
        { role: 'user', content: toolResultBlock('search', 'found') },
      ],
    });

    expect(contents(chat).slice(0, 2)).toEqual(['system: Be b', 'user: Q14']);
    expect(contents(chat).slice(-3)).toEqual([
      'user: And',
      'assistant: call',
      'user: ```t',
    ]);
  });

  it('never cuts inside the current turn, also when the run added most of it', async () => {
    const { chat } = await compact(
      new SummaryCompaction({ summarize: false }),
      {
        messages: conversation(2, 'Look it up.'),
        engine: engine(1000),
        added: [
          { role: 'assistant', content: 'call' },
          { role: 'user', content: toolResultBlock('search', 'a'.repeat(900)) },
          { role: 'assistant', content: 'call' },
          { role: 'user', content: toolResultBlock('search', 'b'.repeat(900)) },
        ],
      },
    );

    expect(contents(chat).slice(0, 3)).toEqual([
      'system: Be b',
      'user: Look',
      'assistant: call',
    ]);
  });

  it('keeps more or less of the conversation when told so', async () => {
    const { chat } = await compact(new SummaryCompaction({ keepRecent: 0.1 }), {
      messages: conversation(18),
      engine: engine(4000, 'Summary.'),
    });

    // 400 tokens: the last two turns and the question.
    expect(contents(chat).slice(0, 2)).toEqual(['system: Be b', 'user: Q17']);
  });

  it('counts fewer characters per token when told so', async () => {
    const { reports } = await compact(
      new SummaryCompaction({ charactersPerToken: 1 }),
      { messages: conversation(7), engine: engine(4096, 'Summary.') },
    );

    expect(reports).toHaveLength(2);
  });

  it('keeps the current turn, whole turns and the limit, whatever the conversation', async () => {
    // A fixed sequence of numbers, so a failure can be repeated.
    let seed = 7;
    const random = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % max;
    };
    const tokens = (chat: readonly ChatMessage[]) =>
      chat.reduce((sum, m) => sum + Math.ceil(m.content.length / 3) + 4, 0);

    for (let thread = 0; thread < 200; thread++) {
      const compaction = new SummaryCompaction({ summarize: random(4) > 0 });
      const contextWindowSize = 1000 + random(7000);
      const model = engine(contextWindowSize);
      model.generate = async function* () {
        yield {
          type: 'text' as const,
          text: 'Goal: g. Facts: f. Open: nothing',
        };
      };
      const messages: Message[] = [
        { id: 'system', role: 'system', content: 's'.repeat(random(600)) },
      ];
      // Several runs of one thread: the conversation grows, the compaction is the same.
      for (let run = 0; run < 4; run++) {
        for (let turn = random(8); turn >= 0; turn--) {
          const id = `${run}-${turn}-${messages.length}`;
          messages.push({
            id: `q${id}`,
            role: 'user',
            content: `Q${id} `.padEnd(10 + random(900), 'x'),
          });
          if (random(3) === 0) {
            messages.push(
              {
                id: `c${id}`,
                role: 'assistant',
                toolCalls: [
                  {
                    id: `call${id}`,
                    type: 'function',
                    function: { name: 'search', arguments: '{}' },
                  },
                ],
              },
              {
                id: `r${id}`,
                role: 'tool',
                toolCallId: `call${id}`,
                content: 'r'.repeat(random(4000)),
              },
            );
          }
          if (turn > 0)
            messages.push({
              id: `a${id}`,
              role: 'assistant',
              content: 'y'.repeat(10 + random(900)),
            });
        }
        const added: ChatMessage[] = [];
        for (let step = random(3); step > 0; step--) {
          added.push(
            { role: 'assistant', content: 'call' },
            {
              role: 'user',
              content: toolResultBlock('search', 'n'.repeat(random(4000))),
            },
          );
        }

        const { chat } = await compact(compaction, {
          messages: [...messages],
          engine: model,
          added,
        });

        const where = `thread ${thread}, run ${run}`;
        const turns = chat.filter((message) => message.role !== 'system');
        // The chat starts with a question of the user, not in the middle of a turn.
        expect(turns[0], where).toMatchObject({
          source: { role: 'user' },
        });
        // No tool result lost its call.
        expect(JSON.stringify(chat), where).not.toContain('"name":"unknown"');
        // The current turn is all there.
        const question = messages.map((m) => m.role).lastIndexOf('user');
        const current = turns.findIndex(
          (message) =>
            (message as { source?: Message }).source === messages[question],
        );
        expect(current, where).toBeGreaterThanOrEqual(0);
        expect(turns.slice(current).length, where).toBe(
          messages.length - question + added.length,
        );
        // It fits, unless the system prompt and the current turn alone are too large.
        if (tokens(chat) > contextWindowSize * 0.9)
          expect(current, where).toBe(0);
        messages.push({ id: `end${run}`, role: 'assistant', content: 'Done.' });
      }
    }
  });

  it('estimates with what the engine counted for the thread', async () => {
    const compaction = new SummaryCompaction();
    const model = engine(4000, 'Summary.');
    // 6 characters per token: the 3758 tokens of the estimate are about 1900.
    const lastCall = { tokens: 1000, characters: 6000 };

    const measured = await compact(compaction, {
      messages: conversation(18),
      engine: model,
      lastCall,
    });
    // The next call of the thread knows it as well.
    const next = await compact(compaction, {
      messages: conversation(18),
      engine: model,
    });

    expect(measured.reports).toEqual([]);
    expect(next.reports).toEqual([]);
    expect(model.requests).toHaveLength(0);
  });

  it('does not trust the count of a short call', async () => {
    const { reports } = await compact(new SummaryCompaction(), {
      messages: conversation(18),
      engine: engine(4000, 'Summary.'),
      lastCall: { tokens: 10, characters: 600 },
    });

    expect(reports.at(-1)).toMatchObject({ status: 'done', summarized: 26 });
  });

  it('keeps the cuts of the last 100 threads only', async () => {
    const compaction = new SummaryCompaction({ summarize: false });
    const model = engine(4000);
    const thread = (threadId: string) =>
      compaction.compact({
        threadId,
        messages: buildChatMessages(conversation(18), []),
        engine: model,
        signal: new AbortController().signal,
        report: () => undefined,
      });

    await thread('first');
    for (let i = 0; i < 100; i++) await thread(`thread ${i}`);

    // The cut of the first thread is gone: it is made, and reported, again.
    const reports: CompactionStatus[] = [];
    await compaction.compact({
      threadId: 'first',
      messages: buildChatMessages(conversation(18), []),
      engine: model,
      signal: new AbortController().signal,
      report: (status) => reports.push(status),
    });
    expect(reports).toHaveLength(1);
  });
});
