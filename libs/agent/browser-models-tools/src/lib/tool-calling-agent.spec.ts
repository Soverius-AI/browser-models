import {
  OutputParser,
  type ChatMessage,
  type ToolSpec,
} from '@soverius-ai/browser-models';
import { ScriptedEngine } from '../testing/scripted-engine.ts';
import type { ToolCallingPart } from './engine-tool-loop.ts';
import {
  ToolCallingAgent,
  type ToolCallingAgentOptions,
} from './tool-calling-agent.ts';
import type { LocalTool } from './tools.ts';

const weather: LocalTool = {
  name: 'weather',
  description: 'Returns the weather of a city.',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
  execute: async ({ city }) => `Sunny in ${String(city)}`,
};
/** A tool the caller runs. */
const setBackground: ToolSpec = {
  name: 'setBackground',
  description: 'Sets the background color of the page.',
  parameters: {
    type: 'object',
    properties: { color: { type: 'string' } },
    required: ['color'],
  },
};
const weatherCall = toolCall('weather', { city: 'Vienna' });
const weatherTurn: ChatMessage[] = [
  {
    role: 'assistant',
    content:
      '```tool_call\n{"name":"weather","arguments":{"city":"Vienna"}}\n```',
  },
  {
    role: 'user',
    content:
      '```tool_result\n{"name":"weather","result":"Sunny in Vienna"}\n```',
  },
];

function toolCall(name: string, args: Record<string, unknown>): string {
  return OutputParser.toolCall(JSON.stringify({ name, arguments: args }));
}

function agentOn(
  engine: ScriptedEngine,
  options: Omit<ToolCallingAgentOptions, 'engine'> = { localTools: [weather] },
): ToolCallingAgent {
  return new ToolCallingAgent({ engine, ...options });
}

/** The parts of a run. The engine streams in small chunks: one part per run of text. */
async function parts(
  run: AsyncIterable<ToolCallingPart>,
): Promise<ToolCallingPart[]> {
  const list: ToolCallingPart[] = [];
  for await (const part of run) {
    const last = list.at(-1);
    if (
      (part.type === 'text' || part.type === 'reasoning') &&
      last?.type === part.type
    )
      list[list.length - 1] = { type: part.type, text: last.text + part.text };
    else list.push(part);
  }
  return list;
}

describe('ToolCallingAgent', () => {
  it('runs a local tool and answers from its result', async () => {
    const engine = new ScriptedEngine(
      `Let me check.\n${weatherCall}`,
      'It is sunny.',
    );
    const agent = agentOn(engine, {
      localTools: [weather],
      messages: [{ role: 'system', content: 'Be brief.' }],
    });
    expect(await parts(agent.run('Weather in Vienna?'))).toEqual([
      { type: 'text', text: 'Let me check.\n' },
      {
        type: 'tool-call',
        call: { name: 'weather', arguments: { city: 'Vienna' } },
        result: 'Sunny in Vienna',
        steps: [],
      },
      { type: 'text', text: 'It is sunny.' },
    ]);
    const [first, second] = engine.requests;
    // One system prompt: the app's and the tool instructions.
    expect(first?.messages).toEqual([
      {
        role: 'system',
        content: expect.stringMatching(/^Be brief\.\n\nYou can call tools/),
      },
      { role: 'user', content: 'Weather in Vienna?' },
    ]);
    const turn = [
      {
        role: 'assistant',
        content: `Let me check.\n\n${weatherTurn[0]?.content}`,
      },
      weatherTurn[1],
    ];
    expect(second?.messages.slice(2)).toEqual(turn);
    // The conversation has the tool turn, and not the tool instructions.
    expect(agent.messages).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Weather in Vienna?' },
      ...turn,
      { role: 'assistant', content: 'It is sunny.' },
    ]);
  });

  it('keeps the conversation: the next run continues it', async () => {
    const engine = new ScriptedEngine('Hello.', 'Still here.');
    const agent = agentOn(engine);
    await parts(agent.run('Hi'));
    await parts(agent.run('And now?'));
    expect(agent.messages).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello.' },
      { role: 'user', content: 'And now?' },
      { role: 'assistant', content: 'Still here.' },
    ]);
    expect(engine.requests[1]?.messages.slice(1)).toEqual(
      agent.messages.slice(0, 3),
    );
  });

  it('adds messages as they are, and nothing for an empty list', async () => {
    const engine = new ScriptedEngine('One.', 'Two.');
    const agent = agentOn(engine, {});
    const given: ChatMessage[] = [
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello.' },
      { role: 'user', content: 'Count.' },
    ];
    await parts(agent.run(given));
    expect(agent.messages).toEqual([
      ...given,
      { role: 'assistant', content: 'One.' },
    ]);
    // Without tools the prompt is the conversation.
    expect(engine.requests[0]?.messages).toEqual(given);
    expect(given).toHaveLength(4);

    await parts(agent.run([{ role: 'user', content: 'Go on.' }]));
    expect(await parts(agent.run([]))).toEqual([]);
    expect(agent.messages.slice(5)).toEqual([
      { role: 'user', content: 'Go on.' },
      { role: 'assistant', content: 'Two.' },
      { role: 'assistant', content: '' },
    ]);
  });

  it('ends the run at a call to a tool the caller runs, and takes its result', async () => {
    const engine = new ScriptedEngine(
      `${weatherCall}\n${toolCall('setBackground', { color: 'blue' })}`,
      'Done: blue, like the sky.',
    );
    const agent = agentOn(engine, {
      localTools: [weather],
      tools: [setBackground],
    });
    expect(await parts(agent.run('Match the weather.'))).toEqual([
      {
        type: 'tool-call',
        call: { name: 'weather', arguments: { city: 'Vienna' } },
        result: 'Sunny in Vienna',
        steps: [],
      },
      {
        type: 'tool-call',
        call: { name: 'setBackground', arguments: { color: 'blue' } },
        steps: [],
      },
    ]);
    expect(engine.requests).toHaveLength(1);
    expect(engine.requests[0]?.messages[0]?.content).toMatch(/setBackground/);

    const result = OutputParser.toolResult('setBackground', 'ok');
    expect(await parts(agent.run(result))).toEqual([
      { type: 'text', text: 'Done: blue, like the sky.' },
    ]);
    // The caller's result is joined to the local tool's: one user message.
    expect(agent.messages).toEqual([
      { role: 'user', content: 'Match the weather.' },
      {
        role: 'assistant',
        content: `${weatherTurn[0]?.content}\n${toolCall('setBackground', { color: 'blue' })}`,
      },
      { role: 'user', content: `${weatherTurn[1]?.content}\n${result}` },
      { role: 'assistant', content: 'Done: blue, like the sky.' },
    ]);
  });

  it('ends with a step-limit part when maxSteps runs out, and can go on', async () => {
    const engine = new ScriptedEngine(weatherCall, weatherCall, 'Sunny.');
    const agent = agentOn(engine, { localTools: [weather], maxSteps: 2 });
    const list = await parts(agent.run('Weather in Vienna?'));
    expect(list.map((part) => part.type)).toEqual([
      'tool-call',
      'tool-call',
      'step-limit',
    ]);
    expect(list.at(-1)).toEqual({ type: 'step-limit', maxSteps: 2 });
    expect(engine.requests).toHaveLength(2);
    // The last results wait in the conversation.
    expect(agent.messages).toEqual([
      { role: 'user', content: 'Weather in Vienna?' },
      ...weatherTurn,
      ...weatherTurn,
    ]);

    expect(await parts(agent.run([]))).toEqual([
      { type: 'text', text: 'Sunny.' },
    ]);
    expect(engine.requests[2]?.messages.at(-1)).toEqual(weatherTurn[1]);
  });

  it('has no step-limit part when the last step is an answer', async () => {
    const engine = new ScriptedEngine(weatherCall, 'Sunny.');
    const list = await parts(
      agentOn(engine, { localTools: [weather], maxSteps: 2 }).run('Weather?'),
    );
    expect(list.map((part) => part.type)).toEqual(['tool-call', 'text']);
  });

  it('throws when it is stopped while the model writes, and keeps the conversation as it was', async () => {
    const engine = new ScriptedEngine(
      'Hello.',
      `A long answer. ${weatherCall}`,
    );
    let ran = false;
    const agent = agentOn(engine, {
      localTools: [{ ...weather, execute: async () => (ran = true) }],
    });
    await parts(agent.run('Hi'));
    const before = agent.messages;

    const abort = new AbortController();
    const seen: ToolCallingPart[] = [];
    const run = async () => {
      for await (const part of agent.run('More', { signal: abort.signal })) {
        seen.push(part);
        abort.abort();
      }
    };
    await expect(run()).rejects.toMatchObject({ name: 'AbortError' });
    expect(seen).toHaveLength(1);
    // The engine went on writing the call: it is not run.
    expect(ran).toBe(false);
    expect(agent.messages).toEqual(before);
  });

  it('throws when it is stopped while a local tool runs', async () => {
    const abort = new AbortController();
    const slow: LocalTool = {
      ...weather,
      execute: async (_args, signal) => {
        abort.abort();
        signal.throwIfAborted();
        return 'never';
      },
    };
    const engine = new ScriptedEngine(weatherCall, 'Sunny.');
    const agent = agentOn(engine, { localTools: [slow] });
    const run = parts(agent.run('Weather?', { signal: abort.signal }));
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(engine.requests).toHaveLength(1);
    expect(agent.messages).toEqual([]);
  });

  it('throws at once with a signal that is already aborted', async () => {
    const engine = new ScriptedEngine('Hello.');
    const run = parts(
      agentOn(engine).run('Hi', { signal: AbortSignal.abort() }),
    );
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(engine.requests).toHaveLength(0);
  });

  it('gives the model the error of a tool that fails', async () => {
    const failing: LocalTool = {
      ...weather,
      execute: async () => {
        throw new Error('no network');
      },
    };
    const engine = new ScriptedEngine(weatherCall, 'I cannot tell.');
    const list = await parts(
      agentOn(engine, { localTools: [failing] }).run('Weather?'),
    );
    expect(list[0]).toMatchObject({
      type: 'tool-call',
      result: '{"error":"no network"}',
    });
  });

  it('reports a tool source that cannot be read, and still answers', async () => {
    const engine = new ScriptedEngine(weatherCall, 'Sunny.');
    const agent = agentOn(engine, {
      localTools: [
        weather,
        {
          tools: async () => {
            throw new Error('MCP server unreachable');
          },
        },
      ],
    });
    expect((await parts(agent.run('Weather?'))).map((part) => part)).toEqual([
      { type: 'source-error', message: 'MCP server unreachable' },
      expect.objectContaining({ type: 'tool-call' }),
      { type: 'text', text: 'Sunny.' },
    ]);
  });

  it('streams thinking as reasoning parts and keeps it out of the conversation', async () => {
    const engine = new ScriptedEngine(
      '<think>The user greets me.</think>\n\nHello.',
    );
    const agent = agentOn(engine);
    expect(await parts(agent.run('Hi'))).toEqual([
      { type: 'reasoning', text: 'The user greets me.' },
      { type: 'text', text: 'Hello.' },
    ]);
    expect(agent.messages.at(-1)).toEqual({
      role: 'assistant',
      content: 'Hello.',
    });
  });

  it('skips empty thinking, such as the <think></think> of Qwen3', async () => {
    const engine = new ScriptedEngine(
      '<think>\n\n</think>\n\nHello.',
      '<think>\n\nHm.\n</think>Yes.',
    );
    const agent = agentOn(engine);
    expect(await parts(agent.run('Hi'))).toEqual([
      { type: 'text', text: 'Hello.' },
    ]);
    // Leading whitespace only: what follows the first words is kept.
    const list = await parts(agent.run('Sure?'));
    expect(list.map((part) => part.type)).toEqual(['reasoning', 'text']);
    expect(list[0]).toMatchObject({ text: expect.stringMatching(/Hm\.\n$/) });
  });

  it('does not run a call the output ended in, and tells the model', async () => {
    const cut = '```tool_call\n{"name": "weather", "arguments": {"city": "Vie';
    const engine = new ScriptedEngine(cut, 'Sunny.');
    const list = await parts(agentOn(engine).run('Weather?'));
    expect(list).toEqual([
      {
        type: 'tool-error',
        raw: '{"name": "weather", "arguments": {"city": "Vie',
        error:
          'The tool call was cut off before it was complete. Send the whole call again.',
      },
      { type: 'text', text: 'Sunny.' },
    ]);
    expect(engine.requests[1]?.messages.at(-1)?.content).toMatch(
      /^```tool_result\n\{"name":"error","result":"The tool call was cut off/,
    );
  });

  it('repairs a call and gives the model the error of one it cannot repair', async () => {
    const engine = new ScriptedEngine(
      toolCall('unknownTool', {}),
      OutputParser.toolCall('weather\n{"city": "Vienna"}'),
      'Sunny.',
    );
    const list = await parts(agentOn(engine).run('Weather?'));
    expect(list[0]).toMatchObject({
      type: 'tool-error',
      error: expect.stringMatching(/^Unknown tool "unknownTool"/),
    });
    expect(list[1]).toMatchObject({
      type: 'tool-call',
      call: { name: 'weather', arguments: { city: 'Vienna' } },
      steps: ['json'],
    });
    expect(list[2]).toEqual({ type: 'text', text: 'Sunny.' });
  });

  it('runs the checks: the model is asked to fix a call that fails one', async () => {
    const vienna = {
      tool: 'weather',
      check: (args: Readonly<Record<string, unknown>>) =>
        args['city'] === 'Vienna' ? undefined : 'only Vienna has weather',
    };
    const engine = new ScriptedEngine(
      toolCall('weather', { city: 'Graz' }),
      '{"city": "Vienna"}',
      'Sunny.',
    );
    const agent = agentOn(engine, { localTools: [weather], checks: [vienna] });
    const list = await parts(agent.run('Weather?'));
    expect(list[0]).toEqual({
      type: 'tool-call',
      call: { name: 'weather', arguments: { city: 'Vienna' } },
      result: 'Sunny in Vienna',
      steps: ['reask'],
    });
    // The re-ask is the second model call; it names the error.
    expect(engine.requests[1]?.messages.at(-1)?.content).toMatch(
      /only Vienna has weather/,
    );
    expect(agent.messages).toHaveLength(4);
  });

  it('uses the repair hook as a last resort', async () => {
    const engine = new ScriptedEngine(toolCall('forecast', {}), 'Sunny.');
    const agent = agentOn(engine, {
      localTools: [weather],
      repairHook: () => ({ name: 'weather', arguments: { city: 'Linz' } }),
    });
    expect((await parts(agent.run('Weather?')))[0]).toMatchObject({
      type: 'tool-call',
      result: 'Sunny in Linz',
      steps: ['hook'],
    });
  });
});
