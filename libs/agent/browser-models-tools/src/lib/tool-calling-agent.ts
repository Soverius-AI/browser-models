import type {
  ChatMessage,
  Engine,
  ToolSpec,
} from '@soverius-ai/browser-models';
import { EngineToolLoop, type ToolCallingPart } from './engine-tool-loop.ts';
import { ToolCalling, type ToolCallingOptions } from './tool-calling.ts';

/** Options of `ToolCallingAgent`. */
export interface ToolCallingAgentOptions extends ToolCallingOptions {
  /** The model. It is loaded at the first run. */
  readonly engine: Engine;
  /**
   * Tools the caller runs. A call to one ends the run with its `tool-call` part, which has no
   * `result`. One of the same name as a local tool wins.
   */
  readonly tools?: readonly ToolSpec[];
  /** The conversation to start from, for example a system prompt. */
  readonly messages?: readonly ChatMessage[];
}

/** Options of `ToolCallingAgent.run()`. */
export interface ToolCallingRunOptions {
  /** Stops the run: `run()` then throws. */
  readonly signal?: AbortSignal;
}

/**
 * Tool calling on an engine, without AG-UI: the model answers or calls tools, the local tools
 * run and their results go back to the model, up to `maxSteps` model calls. Calls are repaired
 * and checked like in `BrowserModelsAgent`. The agent keeps the conversation; it has no
 * compaction and reports no load progress.
 *
 * ```ts
 * const agent = new ToolCallingAgent({ engine: new PromptApiEngine(), localTools: [currentTime] });
 * for await (const part of agent.run('What time is it?')) {
 *   if (part.type === 'text') output.append(part.text);
 * }
 * ```
 */
export class ToolCallingAgent {
  readonly #engine: Engine;
  readonly #tools: readonly ToolSpec[];
  readonly #calling: ToolCalling;
  #messages: readonly ChatMessage[];

  constructor(options: ToolCallingAgentOptions) {
    const { engine, tools = [], messages = [], ...calling } = options;
    this.#engine = engine;
    this.#tools = tools;
    this.#calling = new ToolCalling(calling);
    this.#messages = [...messages];
  }

  /**
   * The conversation so far, as the model sees it: tool calls are ```tool_call blocks in
   * assistant messages, tool results ```tool_result blocks in user messages.
   */
  get messages(): readonly ChatMessage[] {
    return this.#messages;
  }

  /**
   * Adds `input` to the conversation and answers it. A string is one user message; messages
   * are added as they are; `[]` adds nothing and lets the model go on, for example after a
   * `step-limit` part. A system message must be the first of the conversation.
   *
   * The run ends when the model answers without a tool call, after a step with a call to one
   * of `tools` (answer it with `run(OutputParser.toolResult(name, result))`), or after
   * `maxSteps` model calls, with a `step-limit` part. When the conversation ends in tool
   * results that the model has not answered, a user message that follows is joined to them.
   *
   * Throws when `signal` aborts or the engine fails. Only a run that is read to its end
   * changes `messages`.
   */
  async *run(
    input: string | readonly ChatMessage[],
    { signal = new AbortController().signal }: ToolCallingRunOptions = {},
  ): AsyncGenerator<ToolCallingPart> {
    const engine = this.#engine;
    const tools = await this.#calling.start({
      input: { tools: this.#tools },
      engine,
      signal,
    });
    const loop = new EngineToolLoop(engine, tools, this.#with(input), signal);
    yield* loop.run();
    this.#messages = [...loop.messages];
  }

  /** The conversation with `input` added. */
  #with(input: string | readonly ChatMessage[]): ChatMessage[] {
    const added: readonly ChatMessage[] =
      typeof input === 'string' ? [{ role: 'user', content: input }] : input;
    const [first, ...rest] = added;
    const last = this.#messages.at(-1);
    // Chat templates want user and assistant to take turns.
    if (first?.role !== 'user' || last?.role !== 'user') {
      return [...this.#messages, ...added];
    }
    const joined = `${last.content}\n${first.content}`;
    return [
      ...this.#messages.slice(0, -1),
      { role: 'user', content: joined },
      ...rest,
    ];
  }
}
