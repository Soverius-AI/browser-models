import type { ChatMessage } from '../lib/engine.ts';
import { describeEngineContract, FakeModel } from './engine-contract.ts';
import { PromptApiEngine, type LanguageModelApi } from './prompt-api.ts';

/** A stand-in for the browser's LanguageModel that records what it was given. */
function fakeLanguageModel(model = new FakeModel()) {
  model.downloaded = true;
  const calls = {
    initialPrompts: [] as (readonly ChatMessage[] | undefined)[],
    expectations: [] as unknown[],
    prompts: [] as string[],
    constraints: [] as unknown[],
    destroyed: 0,
  };
  const api: LanguageModelApi = {
    availability: async (options) => {
      calls.expectations.push(options);
      if (model.pending > 0) return 'downloading';
      return model.downloaded ? 'available' : 'downloadable';
    },
    async create(options) {
      calls.initialPrompts.push(options?.initialPrompts);
      calls.expectations.push({
        expectedInputs: options?.expectedInputs,
        expectedOutputs: options?.expectedOutputs,
      });
      const monitor = new EventTarget();
      options?.monitor?.(monitor);
      await model.load((loaded) =>
        monitor.dispatchEvent(
          Object.assign(new Event('downloadprogress'), { loaded }),
        ),
      );
      return {
        promptStreaming(input, promptOptions) {
          calls.prompts.push(input);
          calls.constraints.push(promptOptions?.responseConstraint);
          promptOptions?.signal?.addEventListener('abort', () => model.stop());
          const reply = model.reply();
          return new ReadableStream<string>({
            async pull(controller) {
              const { done, value } = await reply.next();
              if (done) controller.close();
              else controller.enqueue(value);
            },
          });
        },
        destroy: () => {
          calls.destroyed++;
          model.stop();
          model.free();
        },
      };
    },
  };
  return { api, calls };
}

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
}

const contractModel = new FakeModel();
describeEngineContract(contractModel, () => {
  const { api } = fakeLanguageModel(contractModel);
  contractModel.downloaded = false;
  return new PromptApiEngine({ languageModel: api });
});

describe('PromptApiEngine', () => {
  it('is unavailable when the browser has no Prompt API', async () => {
    expect(await new PromptApiEngine().availability()).toBe('unavailable');
  });

  it('sends the history as initial prompts and streams the reply', async () => {
    const { api, calls } = fakeLanguageModel();
    const messages: ChatMessage[] = [
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Hi' },
    ];

    const text = await collect(
      new PromptApiEngine({ languageModel: api }).generate({ messages }),
    );

    expect(text).toBe('Hello');
    expect(calls.initialPrompts).toEqual([
      [{ role: 'system', content: 'Be brief.' }],
    ]);
    expect(calls.prompts).toEqual(['Hi']);
    expect(calls.destroyed).toBe(0); // kept for the next turn
  });

  it('reuses the session when the next turn continues the same conversation', async () => {
    const { api, calls } = fakeLanguageModel();
    const engine = new PromptApiEngine({ languageModel: api });
    const first: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
    await collect(engine.generate({ messages: first }));

    const next: ChatMessage[] = [
      ...first,
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'How are you?' },
    ];
    await collect(engine.generate({ messages: next }));

    expect(calls.initialPrompts).toHaveLength(1); // one session for both turns
    expect(calls.prompts).toEqual(['Hi', 'How are you?']);
  });

  it('starts a new session when the conversation changed', async () => {
    const { api, calls } = fakeLanguageModel();
    const engine = new PromptApiEngine({ languageModel: api });
    await collect(
      engine.generate({ messages: [{ role: 'user', content: 'Hi' }] }),
    );
    await collect(
      engine.generate({ messages: [{ role: 'user', content: 'Other' }] }),
    );

    expect(calls.initialPrompts).toHaveLength(2);
    expect(calls.destroyed).toBe(1);
  });

  it('drops a session whose answer was interrupted', async () => {
    const { api, calls } = fakeLanguageModel();
    const engine = new PromptApiEngine({ languageModel: api });
    for await (const chunk of engine.generate({
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      if (chunk === 'Hel') break;
    }
    expect(calls.destroyed).toBe(1);
  });

  it('passes a JSON Schema constraint through', async () => {
    const { api, calls } = fakeLanguageModel();
    const constraint = { type: 'object' };
    await collect(
      new PromptApiEngine({ languageModel: api }).generate({
        messages: [{ role: 'user', content: 'x' }],
        constraint,
      }),
    );
    expect(calls.constraints).toEqual([constraint]);
  });

  it('skips loading when the model is already installed', async () => {
    const { api, calls } = fakeLanguageModel();
    await new PromptApiEngine({ languageModel: api }).load();
    expect(calls.initialPrompts).toHaveLength(0);
  });

  it('destroys the kept session on unload', async () => {
    const { api, calls } = fakeLanguageModel();
    const engine = new PromptApiEngine({ languageModel: api });
    await collect(
      engine.generate({ messages: [{ role: 'user', content: 'Hi' }] }),
    );

    await engine.unload();
    expect(calls.destroyed).toBe(1);
  });

  it('declares the conversation languages to Chrome', async () => {
    const { api, calls } = fakeLanguageModel();
    const engine = new PromptApiEngine({
      languageModel: api,
      languages: ['en', 'de'],
    });
    await engine.availability();
    await collect(
      engine.generate({ messages: [{ role: 'user', content: 'Hallo' }] }),
    );

    const declared = {
      expectedInputs: [{ type: 'text', languages: ['en', 'de'] }],
      expectedOutputs: [{ type: 'text', languages: ['en', 'de'] }],
    };
    expect(calls.expectations).toEqual([declared, declared]);
  });
});
