import { OutputParser, type OutputPart } from './output-parser.ts';

/** Feeds the text in small random-sized pieces, like a real stream. */
function parseInChunks(text: string, seed: number): OutputPart[] {
  const parser = new OutputParser();
  const parts: OutputPart[] = [];
  let position = 0;
  let random = seed;
  while (position < text.length) {
    random = (random * 9301 + 49297) % 233280;
    const size = 1 + (random % 7);
    parts.push(...parser.push(text.slice(position, position + size)));
    position += size;
  }
  parts.push(...parser.end());
  return merged(parts);
}

/** Joins neighbouring text parts and drops tool-call previews, so results do not depend on chunk sizes. */
function merged(parts: OutputPart[]): OutputPart[] {
  const result: OutputPart[] = [];
  for (const part of parts) {
    if (part.kind === 'tool-call-partial') continue;
    const last = result.at(-1);
    if (
      (part.kind === 'text' || part.kind === 'reasoning') &&
      last?.kind === part.kind
    ) {
      result[result.length - 1] = {
        kind: part.kind,
        text: last.text + part.text,
      };
    } else {
      result.push(part);
    }
  }
  return result;
}

describe('OutputParser', () => {
  const output =
    'Let me check.\n```tool_call\n{"name": "getWeather", "arguments": {"city": "Vienna"}}\n```';

  it('splits text and a fenced tool call, however the stream is chunked', () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      expect(parseInChunks(output, seed)).toEqual([
        { kind: 'text', text: 'Let me check.\n' },
        {
          kind: 'tool-call',
          raw: '{"name": "getWeather", "arguments": {"city": "Vienna"}}',
        },
      ]);
    }
  });

  it('understands <tool_call> tags', () => {
    expect(parseInChunks('<tool_call>{"name":"a"}</tool_call>done', 7)).toEqual(
      [
        { kind: 'tool-call', raw: '{"name":"a"}' },
        { kind: 'text', text: 'done' },
      ],
    );
  });

  it('keeps ordinary code fences as text', () => {
    const text = 'Example:\n```ts\nconst a = 1;\n```';
    expect(parseInChunks(text, 5)).toEqual([{ kind: 'text', text }]);
  });

  it('marks a tool call the output ended in as cut off', () => {
    expect(
      parseInChunks('```tool_call\n{"name": "a", "arguments": {"x": 1', 3),
    ).toEqual([
      { kind: 'tool-call-cut', raw: '{"name": "a", "arguments": {"x": 1' },
    ]);
  });
});

describe('OutputParser tool call previews', () => {
  it('reports the body so far while a tool call is being written', () => {
    const parser = new OutputParser();
    expect(parser.push('Hi ```tool_call\n{"name": "a", ')).toEqual([
      { kind: 'text', text: 'Hi ' },
      { kind: 'tool-call-partial', raw: '{"name": "a",' },
    ]);
    // "``" may be the start of the closing fence, so it is held back.
    expect(parser.push('"arguments": {}}\n``')).toEqual([
      { kind: 'tool-call-partial', raw: '{"name": "a", "arguments": {}}' },
    ]);
    expect(parser.push('` bye')).toEqual([
      { kind: 'tool-call', raw: '{"name": "a", "arguments": {}}' },
      { kind: 'text', text: ' bye' },
    ]);
  });
});

describe('OutputParser thinking', () => {
  it('streams <think> blocks as reasoning, then the answer as text', () => {
    expect(parseInChunks('<think>Sunny, so…</think>It is sunny.', 11)).toEqual([
      { kind: 'reasoning', text: 'Sunny, so…' },
      { kind: 'reasoning-end' },
      { kind: 'text', text: 'It is sunny.' },
    ]);
  });

  it('drops a tool result the model echoes, also when it arrives in pieces', () => {
    const echo =
      'Done.\n```tool_result\n{"name":"generateSandboxedUi","result":"UI generated"}\n```\nAnything else?';
    for (const size of [1, 7, echo.length]) {
      const parser = new OutputParser();
      const parts = [
        ...(echo.match(new RegExp(`.{1,${size}}`, 'gs')) ?? []).flatMap(
          (piece) => parser.push(piece),
        ),
        ...parser.end(),
      ];
      const text = parts
        .map((part) => (part.kind === 'text' ? part.text : `[${part.kind}]`))
        .join('');
      expect(text).toBe('Done.\n\nAnything else?');
    }
  });

  it('drops an echoed tool result that is never closed', () => {
    const parser = new OutputParser();
    const parts = [
      ...parser.push('```tool_result\n{"name":"x","result":"y"}'),
      ...parser.end(),
    ];
    expect(parts).toEqual([]);
  });
});

describe('OutputParser tool blocks', () => {
  it('writes a tool call the way it reads one', () => {
    const body = '{"name":"getWeather","arguments":{"city":"Vienna"}}';
    const block = OutputParser.toolCall(body);
    expect(block).toBe('```tool_call\n' + body + '\n```');
    const parser = new OutputParser();
    expect([...parser.push(`Sure.\n${block}`), ...parser.end()]).toEqual([
      { kind: 'text', text: 'Sure.\n' },
      { kind: 'tool-call', raw: body },
    ]);
  });

  it('writes a tool result as JSON with the name, which a model that echoes it never shows', () => {
    const block = OutputParser.toolResult('getWeather', 'Sunny, "22°C"\n');
    expect(block).toBe(
      '```tool_result\n{"name":"getWeather","result":"Sunny, \\"22°C\\"\\n"}\n```',
    );
    const parser = new OutputParser();
    expect([...parser.push(block), ...parser.end()]).toEqual([]);
  });
});
