import {
  OutputParser,
  type ChatMessage,
  type Engine,
  type OutputPart,
  type RepairStep,
  type RunTools,
  type ToolCall,
} from '@soverius-ai/browser-models';

/** Answer text, streamed. */
export interface TextPart {
  readonly type: 'text';
  readonly text: string;
}

/** The model's thinking (`<think>…</think>`), streamed. */
export interface ReasoningPart {
  readonly type: 'reasoning';
  readonly text: string;
}

/**
 * A checked tool call. A local tool ran: `result` is what the model got. A tool the caller
 * runs has no `result`: the run ends after this step and the caller answers the call.
 */
export interface ToolCallPart {
  readonly type: 'tool-call';
  /** The call after repair. */
  readonly call: ToolCall;
  readonly result?: string;
  /** How the call was repaired; empty for a call that was fine. */
  readonly steps: readonly RepairStep[];
}

/** A call that could not be repaired. The model got the error and may call again. */
export interface ToolErrorPart {
  readonly type: 'tool-error';
  /** The call as the model wrote it. */
  readonly raw: string;
  /** What the model was told. */
  readonly error: string;
}

/** A tool source, for example an MCP server, that could not be read. */
export interface SourceErrorPart {
  readonly type: 'source-error';
  readonly message: string;
}

/**
 * The last part of a run that used up `maxSteps`: the results of the last tool calls are in
 * the conversation, but the model has not answered them.
 */
export interface StepLimitPart {
  readonly type: 'step-limit';
  readonly maxSteps: number;
}

/** A part of `ToolCallingAgent.run()`. */
export type ToolCallingPart =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | ToolErrorPart
  | SourceErrorPart
  | StepLimitPart;

const CUT_OFF =
  'The tool call was cut off before it was complete. Send the whole call again.';

/**
 * The tool loop of `ToolCallingAgent`, on a plain engine: the model answers or calls tools;
 * every call is checked and run, and its result goes back to the model, up to `maxSteps` model
 * calls. A call to a tool that does not run here ends the loop after its step.
 */
export class EngineToolLoop {
  readonly #engine: Engine;
  readonly #tools: RunTools;
  readonly #signal: AbortSignal;
  readonly #chat: ChatMessage[];

  constructor(
    engine: Engine,
    tools: RunTools,
    messages: readonly ChatMessage[],
    signal: AbortSignal,
  ) {
    this.#engine = engine;
    this.#tools = tools;
    this.#signal = signal;
    this.#chat = [...messages];
  }

  /** The conversation: the messages it started with and what the loop added so far. */
  get messages(): readonly ChatMessage[] {
    return this.#chat;
  }

  /** Runs the loop. Call it once. Throws when the signal aborts. */
  async *run(): AsyncGenerator<ToolCallingPart> {
    for (const message of this.#tools.errors) {
      yield { type: 'source-error', message };
    }
    await this.#engine.load({ signal: this.#signal });
    this.#signal.throwIfAborted();

    const { maxSteps } = this.#tools;
    for (let step = 0; step < maxSteps; step++) {
      const prompt = this.#prompt();
      const reply = yield* this.#reply(prompt);
      if (reply.calls.length === 0) {
        this.#chat.push({ role: 'assistant', content: reply.text });
        return;
      }
      const handedOver = yield* this.#runCalls(reply, prompt);
      if (handedOver) return;
    }
    yield { type: 'step-limit', maxSteps };
  }

  /** One model call, streamed as text and thinking. */
  async *#reply(
    prompt: readonly ChatMessage[],
  ): AsyncGenerator<TextPart | ReasoningPart, Reply> {
    const parser = new OutputParser();
    const reply = new Reply();
    for await (const part of this.#engine.generate({
      messages: prompt,
      signal: this.#signal,
    })) {
      // Not every engine throws when it is stopped. A stopped call must not be repaired or run.
      this.#signal.throwIfAborted();
      if (part.type === 'text') yield* reply.read(parser.push(part.text));
    }
    this.#signal.throwIfAborted();
    yield* reply.read(parser.end());
    return reply;
  }

  /**
   * Checks and runs the calls of a reply, then adds the turn and its results to the chat.
   * Returns whether a call was for a tool that does not run here.
   */
  async *#runCalls(
    reply: Reply,
    prompt: readonly ChatMessage[],
  ): AsyncGenerator<ToolCallPart | ToolErrorPart, boolean> {
    const turn = reply.text ? [reply.text] : [];
    const results: string[] = [];
    let handedOver = false;
    for (const written of reply.calls) {
      const part = await this.#runCall(written, prompt);
      yield part;
      if (part.type === 'tool-error') {
        turn.push(OutputParser.toolCall(part.raw));
        results.push(OutputParser.toolResult('error', part.error));
        continue;
      }
      const { name, arguments: args } = part.call;
      turn.push(
        OutputParser.toolCall(JSON.stringify({ name, arguments: args })),
      );
      if (part.result === undefined) handedOver = true;
      else results.push(OutputParser.toolResult(name, part.result));
    }
    this.#chat.push({ role: 'assistant', content: turn.join('\n') });
    if (results.length > 0) {
      this.#chat.push({ role: 'user', content: results.join('\n') });
    }
    return handedOver;
  }

  async #runCall(
    written: WrittenCall,
    prompt: readonly ChatMessage[],
  ): Promise<ToolCallPart | ToolErrorPart> {
    const { raw, cut } = written;
    // A call that was cut off is not guessed at: half the arguments may be missing.
    if (cut) return { type: 'tool-error', raw, error: CUT_OFF };
    const checked = await this.#tools.check(raw, prompt);
    // A stopped re-ask counts as failed in ToolCallRepair; stop here instead.
    this.#signal.throwIfAborted();
    if (!checked.ok) return { type: 'tool-error', raw, error: checked.error };

    const { call, steps } = checked;
    const result = await this.#tools.run(call);
    // A tool that fails because it was stopped must not look like a tool that ran.
    this.#signal.throwIfAborted();
    return result === undefined
      ? { type: 'tool-call', call, steps }
      : { type: 'tool-call', call, result, steps };
  }

  /** The chat as the model gets it: with the tool instructions in the system prompt. */
  #prompt(): readonly ChatMessage[] {
    const { instructions } = this.#tools;
    if (!instructions) return [...this.#chat];
    const [first, ...rest] = this.#chat;
    if (first?.role !== 'system') {
      return [{ role: 'system', content: instructions }, ...this.#chat];
    }
    const system = `${first.content}\n\n${instructions}`;
    return [{ role: 'system', content: system }, ...rest];
  }
}

/** A call the model finished writing, or the one its output ended in. */
interface WrittenCall {
  readonly raw: string;
  readonly cut: boolean;
}

/** What the model wrote in one step: its text and its calls. */
class Reply {
  text = '';
  readonly calls: WrittenCall[] = [];
  /** Whether the thinking block that is open has been shown. */
  #thinking = false;

  /** Text and thinking as parts; finished calls are kept. */
  *read(parts: readonly OutputPart[]): Generator<TextPart | ReasoningPart> {
    for (const part of parts) {
      switch (part.kind) {
        case 'text': {
          // Drop the whitespace that models put between thinking, calls and the answer.
          const text = this.text ? part.text : part.text.trimStart();
          if (!text) break;
          this.text += text;
          yield { type: 'text', text };
          break;
        }
        case 'reasoning':
          // Skip leading whitespace, for example the empty <think></think> of Qwen3.
          if (!this.#thinking && !part.text.trim()) break;
          this.#thinking = true;
          yield { type: 'reasoning', text: part.text };
          break;
        case 'reasoning-end':
          this.#thinking = false;
          break;
        case 'tool-call':
        case 'tool-call-cut':
          this.calls.push({
            raw: part.raw,
            cut: part.kind === 'tool-call-cut',
          });
          break;
        default:
          // Half-written calls: nothing to show without a client.
          break;
      }
    }
  }
}
