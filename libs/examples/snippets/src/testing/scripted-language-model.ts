import type { LanguageModelApi } from '@soverius-ai/browser-models/prompt-api';

/**
 * A scripted stand-in for the browser's `LanguageModel`, so the snippets run as written: the
 * real engines, agent and tool calling, only the model is fake. It calls a tool when the
 * prompt names one, and answers from a tool result.
 */
export class ScriptedLanguageModel implements LanguageModelApi {
  async availability(): Promise<Availability> {
    return 'available';
  }

  async create(): Promise<LanguageModel> {
    return {
      contextWindow: 9216,
      contextUsage: 100,
      promptStreaming: (input: string) =>
        ScriptedLanguageModel.#stream(ScriptedLanguageModel.reply(input)),
      destroy: () => undefined,
    } as unknown as LanguageModel;
  }

  /** What the model answers to a prompt. */
  static reply(prompt: string): string {
    const result = /```tool_result\n(.*)\n```/s.exec(prompt)?.[1];
    if (result)
      return `The tool answered: ${(JSON.parse(result) as { result: string }).result}`;
    if (/time/i.test(prompt))
      return ScriptedLanguageModel.#toolCall('currentTime', {});
    if (/background/i.test(prompt))
      return ScriptedLanguageModel.#toolCall('setBackground', {
        color: 'lightblue',
      });
    return 'A model in your browser answered.';
  }

  static #toolCall(name: string, args: Record<string, unknown>): string {
    return (
      '```tool_call\n' + JSON.stringify({ name, arguments: args }) + '\n```'
    );
  }

  /** The reply word by word, like a model streams it. */
  static #stream(text: string): ReadableStream<string> {
    const words = text.split(/(?<= )/);
    return new ReadableStream<string>({
      pull(controller) {
        const word = words.shift();
        if (word === undefined) controller.close();
        else controller.enqueue(word);
      },
    });
  }
}
