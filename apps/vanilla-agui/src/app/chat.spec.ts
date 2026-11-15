import { agent } from './agent';
import { send } from './chat';

describe('send (plain AG-UI client)', () => {
  it('runs the frontend tool in the page and continues the conversation', async () => {
    agent.selectModel('demo');

    await send('Change the background', {});

    expect(document.body.style.background).toContain('lightblue');
    expect(agent.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'The tool answered: Background set to lightblue',
    });
  });
});
