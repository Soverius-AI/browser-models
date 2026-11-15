import type { JsonSchema } from './engine.ts';

/** What the model needs to know about a tool. */
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  /** JSON Schema of the arguments object. */
  readonly parameters?: JsonSchema;
}

/**
 * A tool that runs inside the agent, in the browser. Its result goes back to the model.
 * Type the arguments with `const tool: LocalTool<{ city: string }> = { … }`.
 */
export interface LocalTool<Args = Record<string, unknown>> extends ToolSpec {
  // Method syntax on purpose: it lets a LocalTool<{ city: string }> sit in a LocalTool[] list.
  execute(args: Args, signal: AbortSignal): Promise<unknown>;
}

/** Supplies local tools at the start of every run, for example the page's WebMCP tools. */
export interface LocalToolSource {
  /** `signal` aborts when the run is stopped. */
  tools(signal: AbortSignal): Promise<readonly LocalTool[]>;
}

/**
 * Resolves a mix of tools and tool sources into one list. A failing source (for example an
 * unreachable MCP server) is skipped and reported in `errors`, so the run can go on.
 */
export async function resolveLocalTools(
  entries: readonly (LocalTool | LocalToolSource)[],
  signal: AbortSignal,
): Promise<{ tools: LocalTool[]; errors: string[] }> {
  const errors: string[] = [];
  const lists = await Promise.all(
    entries.map(async (entry) => {
      if (!('tools' in entry)) return [entry];
      try {
        return await entry.tools(signal);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        return [];
      }
    }),
  );
  return { tools: lists.flat(), errors };
}

/** A tool call after parsing and repair. */
export interface ToolCall {
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}
