import type { ToolSpec } from '@soverius-ai/browser-models';

/** The part of a parameter's JSON Schema the example call uses. */
interface ParameterSchema {
  readonly type?: unknown;
  readonly enum?: readonly unknown[];
}

/** A value of each JSON Schema type, for the example call. */
const EXAMPLE_VALUES: Readonly<Record<string, unknown>> = {
  string: '…',
  number: 1,
  integer: 1,
  boolean: true,
  array: [],
  object: {},
};

/** How to call the tools, for the system prompt. */
export class ToolInstructions {
  /** The instructions for `tools`, or undefined without tools. */
  static describe(tools: readonly ToolSpec[]): string | undefined {
    if (tools.length === 0) return undefined;
    const list = tools.map(
      (tool) =>
        `- ${tool.name}: ${tool.description}\n  arguments (JSON Schema): ${JSON.stringify(tool.parameters ?? { type: 'object' })}`,
    );
    return [
      'You can call tools. To call one, reply with a block like this and nothing after it:',
      '```tool_call\n' + ToolInstructions.#exampleCall(tools) + '\n```',
      'Use the exact name of one of the available tools below, and arguments that match its schema.',
      'Tool results come back in a ```tool_result block. Only call a tool when you need it.',
      'After a tool result, answer the user in plain words. Never write a tool_result block yourself.',
      'If a tool result is an error, do not give up: fix the arguments or call the tool that provides what is missing, then try again.',
      'Available tools:',
      ...list,
    ].join('\n');
  }

  /**
   * A real call, not a template: small models copy a placeholder like "<tool name>" as it is.
   * They copy the example's values too, so it shows a simple tool, never one such as
   * generateSandboxedUi whose copied example would be a broken page. One with an argument, so
   * the model sees where arguments go: with `{}` some write the name and the arguments apart.
   * Layout: `{"name": "x", "arguments": {"a": "…"}}`.
   */
  static #exampleCall(tools: readonly ToolSpec[]): string {
    const tool = ToolInstructions.#simplest(tools);
    const args = Object.entries(ToolInstructions.#exampleArguments(tool))
      .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
      .join(', ');
    return `{"name": ${JSON.stringify(tool.name)}, "arguments": {${args}}}`;
  }

  /**
   * The tool with the fewest parameters among those with a required one, else the one with the
   * fewest parameters; the first of those.
   */
  static #simplest(tools: readonly ToolSpec[]): ToolSpec {
    const withRequired = tools.filter(
      (tool) => ToolInstructions.#required(tool).length > 0,
    );
    const candidates = withRequired.length > 0 ? withRequired : tools;
    const count = (tool: ToolSpec) =>
      Object.keys(ToolInstructions.#parameters(tool)).length;
    return candidates.reduce((best, tool) =>
      count(tool) < count(best) ? tool : best,
    );
  }

  /** A value of the right type for each required parameter. */
  static #exampleArguments(tool: ToolSpec): Record<string, unknown> {
    const parameters = ToolInstructions.#parameters(tool);
    return Object.fromEntries(
      ToolInstructions.#required(tool).map((name) => {
        const schema = parameters[name];
        const value =
          schema?.enum?.[0] ?? EXAMPLE_VALUES[String(schema?.type)] ?? '…';
        return [name, value];
      }),
    );
  }

  static #parameters(
    tool: ToolSpec,
  ): Readonly<Record<string, ParameterSchema>> {
    return (tool.parameters?.['properties'] ?? {}) as Readonly<
      Record<string, ParameterSchema>
    >;
  }

  static #required(tool: ToolSpec): readonly string[] {
    const required = tool.parameters?.['required'];
    return Array.isArray(required) ? required.map(String) : [];
  }
}
