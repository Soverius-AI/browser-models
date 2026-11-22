import { demoEngine } from '@soverius-ai/example-shared';
import { Conversation } from './conversation';

function recorder() {
  const seen = { text: '', thinking: '', finished: [] as unknown[] };
  return {
    seen,
    view: {
      text: (delta: string) => void (seen.text += delta),
      thinking: (delta: string) => void (seen.thinking += delta),
      finished: (reason: string, usage: unknown) =>
        void seen.finished.push({ reason, usage }),
    },
  };
}

describe('Conversation (engine only)', () => {
  it('streams the reply, keeps the history and reports the end', async () => {
    const conversation = new Conversation();
    const { seen, view } = recorder();

    await conversation.send(demoEngine(), 'Hello', view);

    expect(seen.text).toBe('You said: Hello');
    expect(seen.finished).toEqual([
      { reason: 'stop', usage: { totalTokens: expect.any(Number) } },
    ]);
    expect(conversation.history.slice(1)).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'You said: Hello' },
    ]);
  });

  it('shows thinking apart from the answer', async () => {
    const { seen, view } = recorder();

    await new Conversation().send(demoEngine(), 'think about it', view);

    expect(seen.thinking).toContain('The user wants to see thinking.');
    expect(seen.text).toBe('This is the answer, after the thinking.');
  });

  it('stops a reply and keeps what arrived', async () => {
    const conversation = new Conversation();
    const { view } = recorder();
    const engine = demoEngine();
    await engine.load();

    const sending = conversation.send(engine, 'Plan a trip', view);
    conversation.stop();
    await sending;

    expect(conversation.replying).toBe(false);
    expect(conversation.history.at(-1)?.role).toBe('assistant');
  });
});
