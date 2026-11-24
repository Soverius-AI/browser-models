import {
  OutputParser,
  type ChatMessage,
  type CheckedCall,
  type Engine,
  type OutputPart,
  type RunTools,
  type ToolCall,
  type ToolSpec,
} from '@soverius-ai/browser-models';
import { ToolCallRepair, type RepairOptions } from './repair.ts';
import { ToolInstructions } from './tool-instructions.ts';
import type { LocalTool } from './tools.ts';

/** What the tools of one run are made from. */
export interface ActiveToolsOptions {
  /** Every tool the model may call: the client's and the local ones. */
  readonly tools: readonly ToolSpec[];
  /** The tools that run here. */
  readonly local: readonly LocalTool[];
  /** Tool sources that could not be read. */
  readonly errors: readonly string[];
  readonly maxSteps: number;
  readonly engine: Engine;
  readonly signal: AbortSignal;
  readonly checks?: RepairOptions['checks'];
  readonly hook?: RepairOptions['hook'];
}

const REASK_NOTE =
  'Reply with only the corrected arguments as one JSON object.';

/** The tools of one run: their instructions, the repair of calls and the local tools. */
export class ActiveTools implements RunTools {
  readonly tools: readonly ToolSpec[];
  readonly instructions: string | undefined;
  readonly errors: readonly string[];
  readonly maxSteps: number;
  readonly #local: readonly LocalTool[];
  readonly #engine: Engine;
  readonly #signal: AbortSignal;
  readonly #repair: ToolCallRepair;
  /** What the model got for the call that is being checked, for a re-ask. */
  #prompt: readonly ChatMessage[] = [];

  constructor(options: ActiveToolsOptions) {
    this.tools = options.tools;
    this.instructions = ToolInstructions.describe(options.tools);
    this.errors = options.errors;
    this.maxSteps = options.maxSteps;
    this.#local = options.local;
    this.#engine = options.engine;
    this.#signal = options.signal;
    this.#repair = new ToolCallRepair(options.tools, {
      reask: (tool, error, raw) => this.#reask(raw, tool, error),
      ...(options.checks ? { checks: options.checks } : {}),
      ...(options.hook ? { hook: options.hook } : {}),
    });
  }

  readPartial(raw: string) {
    return this.#repair.readPartial(raw);
  }

  check(raw: string, prompt: readonly ChatMessage[]): Promise<CheckedCall> {
    this.#prompt = prompt;
    return this.#repair.repair(raw);
  }

  run(call: ToolCall): Promise<string> | undefined {
    const tool = this.#local.find((local) => local.name === call.name);
    return tool && this.#execute(tool, call.arguments);
  }

  /** Runs a local tool; a failure becomes an error result for the model. */
  async #execute(
    tool: LocalTool,
    args: Readonly<Record<string, unknown>>,
  ): Promise<string> {
    try {
      const result = await tool.execute({ ...args }, this.#signal);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ error: message });
    }
  }

  /**
   * Asks the model once for corrected arguments, forcing JSON output when the engine can. The
   * model sees its own call (`raw`) and the tool's schema. It may answer with the arguments or
   * with a whole new tool call.
   */
  async #reask(
    raw: string,
    tool: ToolSpec,
    error: string,
  ): Promise<string | undefined> {
    const engine = this.#engine;
    const schema = JSON.stringify(tool.parameters ?? { type: 'object' });
    const messages: ChatMessage[] = [
      ...this.#prompt,
      { role: 'assistant', content: OutputParser.toolCall(raw) },
      {
        role: 'user',
        content: `Your call to the tool "${tool.name}" had invalid arguments: ${error}. The arguments must match this JSON Schema: ${schema}. ${REASK_NOTE}`,
      },
    ];
    const constraint =
      engine.supportsConstraint && tool.parameters
        ? { constraint: tool.parameters }
        : {};

    // Same parser as the answers, so thinking (<think>…</think>) is not part of the answer.
    const parser = new OutputParser();
    const answer = new ReaskAnswer();
    for await (const part of engine.generate({
      messages,
      signal: this.#signal,
      ...constraint,
    })) {
      if (part.type === 'text') answer.read(parser.push(part.text));
    }
    answer.read(parser.end());
    return answer.value;
  }
}

/** The model's answer to a re-ask: a tool call, else its text. */
class ReaskAnswer {
  #text = '';
  #call: string | undefined;

  read(parts: readonly OutputPart[]): void {
    for (const part of parts) {
      if (part.kind === 'text') this.#text += part.text;
      if (part.kind === 'tool-call') this.#call = part.raw;
    }
  }

  get value(): string | undefined {
    return (this.#call ?? this.#text).trim() || undefined;
  }
}
