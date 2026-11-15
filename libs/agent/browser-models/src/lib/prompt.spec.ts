import type { Message } from '@ag-ui/core';
import {
  buildChatMessages,
  shortenToolResults,
  toolResultBlock,
} from './prompt.ts';

describe('buildChatMessages', () => {
  it('tells the model that a tool without a result ran fine', () => {
    const messages: Message[] = [
      { id: '1', role: 'user', content: 'Show incident INC-4711' },
      {
        id: '2',
        role: 'assistant',
        toolCalls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'show_incident', arguments: '{"id":"INC-4711"}' },
          },
        ],
      },
      { id: '3', role: 'tool', toolCallId: 'c1', content: '' },
    ];

    const chat = buildChatMessages(messages, [], []);

    expect(chat.at(-1)).toEqual({
      role: 'user',
      content:
        '```tool_result\n{"name":"show_incident","result":"Done. The tool ran and returned no data."}\n```',
      source: messages[2],
    });
  });

  it('merges system and developer messages and context into one system prompt', () => {
    const messages: Message[] = [
      { id: '1', role: 'system', content: 'Be brief.' },
      { id: '2', role: 'developer', content: 'Answer in English.' },
      { id: '3', role: 'user', content: 'Hi' },
    ];
    const chat = buildChatMessages(
      messages,
      [{ description: 'User name', value: 'Ada' }],
      [],
    );

    expect(chat).toEqual([
      {
        role: 'system',
        content: 'Be brief.\n\nAnswer in English.\n\nUser name:\nAda',
      },
      { role: 'user', content: 'Hi', source: messages[2] },
    ]);
  });

  it('describes the tools and how to call them', () => {
    const chat = buildChatMessages(
      [{ id: '1', role: 'user', content: 'Hi' }],
      [],
      [
        {
          name: 'getWeather',
          description: 'Weather for a city',
          parameters: { type: 'object' },
        },
      ],
    );

    const system = chat[0]?.content ?? '';
    expect(system).toContain('- getWeather: Weather for a city');
    expect(system).toContain('```tool_call');
  });

  it('writes earlier tool calls and results back in the call format', () => {
    const messages: Message[] = [
      { id: '1', role: 'user', content: 'Weather?' },
      {
        id: '2',
        role: 'assistant',
        content: 'Checking.',
        toolCalls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'getWeather', arguments: '{"city":"Graz"}' },
          },
        ],
      },
      { id: '3', role: 'tool', toolCallId: 'c1', content: 'Sunny' },
    ];
    const chat = buildChatMessages(messages, [], []);

    expect(chat.slice(1)).toEqual([
      {
        role: 'assistant',
        content:
          'Checking.\n```tool_call\n{"name": "getWeather", "arguments": {"city":"Graz"}}\n```',
        source: messages[1],
      },
      {
        role: 'user',
        content: '```tool_result\n{"name":"getWeather","result":"Sunny"}\n```',
        source: messages[2],
      },
    ]);
  });

  it('keeps only the text parts of user messages and skips activity messages', () => {
    const messages: Message[] = [
      { id: '1', role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      {
        id: '2',
        role: 'activity',
        activityType: 'soverius.model',
        content: { status: 'ready' },
      },
    ];
    expect(buildChatMessages(messages, [], [])).toEqual([
      { role: 'user', content: 'Hello', source: messages[0] },
    ]);
  });
});

describe('shortenToolResults', () => {
  it('cuts long results and leaves the text around them', () => {
    const content = `Before\n${toolResultBlock('search', 'a'.repeat(50))}\nAfter`;

    expect(shortenToolResults(content, 10)).toBe(
      `Before\n${toolResultBlock('search', 'a'.repeat(10) + '\n… (shortened)')}\nAfter`,
    );
  });

  it('cuts every result of a message', () => {
    const content = [
      toolResultBlock('one', 'a'.repeat(50)),
      toolResultBlock('two', 'short'),
      toolResultBlock('three', 'c\n'.repeat(25)),
    ].join('\n');

    expect(shortenToolResults(content, 10)).toBe(
      [
        toolResultBlock('one', 'a'.repeat(10) + '\n… (shortened)'),
        toolResultBlock('two', 'short'),
        toolResultBlock('three', 'c\n'.repeat(5) + '\n… (shortened)'),
      ].join('\n'),
    );
  });

  it('does not cut a result twice', () => {
    const once = shortenToolResults(
      toolResultBlock('search', 'a'.repeat(50)),
      10,
    );

    expect(shortenToolResults(once, 10)).toBe(once);
  });

  it('leaves a block alone that is not one of ours', () => {
    const typed = '```tool_result\nnot json\n```';

    expect(shortenToolResults(typed, 1)).toBe(typed);
  });
});
