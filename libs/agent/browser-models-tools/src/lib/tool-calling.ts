import {
  OutputParser,
  type ChatMessage,
  type Engine,
  type JsonSchema,
  type OutputPart,
} from '@soverius-ai/browser-models';
import type {
  CheckedCall,
  RunTools,
  ToolCall,
  Tools,
  ToolSpec,
  ToolsRun,
} from '@soverius-ai/browser-models-agui';
import { ToolCallRepair, type RepairOptions } from './repair.ts';
import {
  resolveLocalTools,
  type LocalTool,
  type LocalToolSource,
} from './tools.ts';

/** Options of `ToolCalling`. */
export interface ToolCallingOptions {
  /**
   * Tools that run in the agent, or sources like `new McpTools(url)` read at the start of every
   * run. The client's tools (`input.tools`) are offered too; one of the same name wins.
   */
  readonly localTools?: readonly (LocalTool | LocalToolSource)[];
  /** Most model calls in one run, counting the ones after tool results. Default 5. */
  readonly maxSteps?: number;
  /** Your own last-chance fix of a broken call. */
  readonly repairHook?: RepairOptions['hook'];
}

/**
 * Tool calling for `BrowserModelsAgent`: the client's tools and the agent's own, offered to the
 * model in the system prompt. Every call is repaired and checked against its schema (see
 * `ToolCallRepair`); the agent's tools run here, the client's tools in the client.
 *
 * ```ts
 * new BrowserModelsAgent({ models, defaultModel: 'gemma', tools: new ToolCalling({ localTools }) });
 * ```
 */
export class ToolCalling implements Tools {
  readonly #options: ToolCallingOptions;

  constructor(options: ToolCallingOptions = {}) {
    this.#options = options;
  }

  async start({ input, engine, signal }: ToolsRun): Promise<RunTools> {
    // A client tool wins over a local tool of the same name (CopilotKit can also publish its
    // tools to WebMCP, so the same tool may arrive both ways).
    const clientNames = new Set(input.tools.map((tool) => tool.name));
    const resolved = await resolveLocalTools(
      this.#options.localTools ?? [],
      signal,
    );
    const local = resolved.tools.filter((tool) => !clientNames.has(tool.name));
    return new ActiveTools({
      tools: [...input.tools, ...local],
      local,
      errors: resolved.errors,
      maxSteps: this.#options.maxSteps ?? 5,
      engine,
      signal,
      ...(this.#options.repairHook ? { hook: this.#options.repairHook } : {}),
    });
  }
}

const REASK_NOTE =
  'Reply with only the corrected arguments as one JSON object.';

/** The tools of one run. */
class ActiveTools implements RunTools {
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

  constructor(run: {
    readonly tools: readonly ToolSpec[];
    readonly local: readonly LocalTool[];
    readonly errors: readonly string[];
    readonly maxSteps: number;
    readonly engine: Engine;
    readonly signal: AbortSignal;
    readonly hook?: RepairOptions['hook'];
  }) {
    this.tools = run.tools;
    this.instructions =
      run.tools.length > 0 ? ActiveTools.#instructions(run.tools) : undefined;
    this.errors = run.errors;
    this.maxSteps = run.maxSteps;
    this.#local = run.local;
    this.#engine = run.engine;
    this.#signal = run.signal;
    this.#repair = new ToolCallRepair(run.tools, {
      reask: (tool, error, raw) => this.#reask(raw, tool, error),
      ...(run.hook ? { hook: run.hook } : {}),
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

  async #execute(
    tool: LocalTool,
    args: Readonly<Record<string, unknown>>,
  ): Promise<string> {
    try {
      const result = await tool.execute({ ...args }, this.#signal);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
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
    const request: ChatMessage = {
      role: 'user',
      content: `Your call to the tool "${tool.name}" had invalid arguments: ${error}. The arguments must match this JSON Schema: ${schema}. ${REASK_NOTE}`,
    };
    // Same parser as the answers, so thinking (<think>…</think>) is not part of the answer.
    const parser = new OutputParser();
    let text = '';
    let call: string | undefined;
    const keep = (parts: readonly OutputPart[]) => {
      for (const part of parts) {
        if (part.kind === 'text') text += part.text;
        if (part.kind === 'tool-call') call = part.raw;
      }
    };
    for await (const part of engine.generate({
      messages: [
        ...this.#prompt,
        { role: 'assistant', content: '```tool_call\n' + raw + '\n```' },
        request,
      ],
      signal: this.#signal,
      ...(engine.supportsConstraint && tool.parameters
        ? { constraint: tool.parameters }
        : {}),
    })) {
      if (part.type === 'text') keep(parser.push(part.text));
    }
    keep(parser.end());
    return (call ?? text).trim() || undefined;
  }

  /** How to call the tools, for the system prompt. */
  static #instructions(tools: readonly ToolSpec[]): string {
    const list = tools
      .map(
        (tool) =>
          `- ${tool.name}: ${tool.description}\n  arguments (JSON Schema): ${JSON.stringify(tool.parameters ?? { type: 'object' })}`,
      )
      .join('\n');
    // A real call, not a template: small models copy a placeholder like "<tool name>" as it is.
    // They copy the example's values too, so it shows the simplest tool, never one such as
    // generateSandboxedUi whose copied example would be a broken page.
    const simplest = ActiveTools.#simplest(tools);
    const example = JSON.stringify({
      name: simplest?.name ?? 'toolName',
      arguments: ActiveTools.#exampleArguments(simplest?.parameters),
    });
    return [
      'You can call tools. To call one, reply with a block like this and nothing after it:',
      '```tool_call\n' + example + '\n```',
      'Use the exact name of one of the available tools below, and arguments that match its schema.',
      'Tool results come back in a ```tool_result block. Only call a tool when you need it.',
      'After a tool result, answer the user in plain words. Never write a tool_result block yourself.',
      'If a tool result is an error, do not give up: fix the arguments or call the tool that provides what is missing, then try again.',
      'Available tools:',
      list,
    ].join('\n');
  }

  /** The tool with the fewest parameters; the first of those. */
  static #simplest(tools: readonly ToolSpec[]): ToolSpec | undefined {
    const count = (tool: ToolSpec) =>
      Object.keys(ActiveTools.#properties(tool.parameters)).length;
    return tools.reduce<ToolSpec | undefined>(
      (best, tool) => (!best || count(tool) < count(best) ? tool : best),
      undefined,
    );
  }

  static #properties(
    schema: JsonSchema | undefined,
  ): Record<
    string,
    { readonly type?: unknown; readonly enum?: readonly unknown[] }
  > {
    return (schema?.['properties'] ?? {}) as Record<
      string,
      { readonly type?: unknown; readonly enum?: readonly unknown[] }
    >;
  }

  /** Example arguments: a value of the right type for each required parameter. */
  static #exampleArguments(
    schema: JsonSchema | undefined,
  ): Record<string, unknown> {
    const required = schema?.['required'];
    const names = Array.isArray(required) ? required.map(String) : [];
    const properties = ActiveTools.#properties(schema);
    return Object.fromEntries(
      names.map((key) => {
        const property = properties[key];
        return [
          key,
          property?.enum?.[0] ?? EXAMPLE_VALUES[String(property?.type)] ?? '…',
        ];
      }),
    );
  }
}

/** A value of each JSON Schema type, for the example call in the instructions. */
const EXAMPLE_VALUES: Readonly<Record<string, unknown>> = {
  string: '…',
  number: 1,
  integer: 1,
  boolean: true,
  array: [],
  object: {},
};
