import { agent } from './agent';

describe('agent without tools', () => {
  beforeEach(() => {
    agent.selectModel('demo');
    agent.setMessages([]);
  });

  it('chats', async () => {
    agent.addMessage({ id: '1', role: 'user', content: 'Hello' });

    const { newMessages } = await agent.runAgent();

    // The demo engine's first load also adds a model loading activity message.
    expect(
      newMessages.filter((message) => message.role === 'assistant'),
    ).toEqual([expect.objectContaining({ content: 'You said: Hello' })]);
  });

  it("does not offer the client's tools, and runs no tool call", async () => {
    agent.addMessage({ id: '1', role: 'user', content: 'What time is it?' });

    const { newMessages } = await agent.runAgent({
      tools: [{ name: 'currentTime', description: 'The time', parameters: {} }],
    });

    expect(
      newMessages.flatMap((message) =>
        message.role === 'assistant' ? (message.toolCalls ?? []) : [],
      ),
    ).toEqual([]);
  });
});
