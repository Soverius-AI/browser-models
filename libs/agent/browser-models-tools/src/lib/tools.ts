import type { ToolSpec } from '@soverius-ai/browser-models-agui';

/**
 * A tool that runs inside the agent, in the browser. Its result goes back to the model.
 * Type the arguments with `const tool: LocalTool<{ city: string }> = { … }`.
 */
export interface LocalTool<Args = Record<string, unknown>> extends ToolSpec {
  // Method syntax on purpose: it lets a LocalTool<{ city: string }> sit in a LocalTool[] list.
  /** Runs the tool. The result goes back to the model, as text or as JSON. */
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
