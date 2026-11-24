import type { Engine, RunTools, ToolSpec } from '@soverius-ai/browser-models';
import { ActiveTools } from './active-tools.ts';
import type { RepairOptions } from './repair.ts';
import {
  resolveLocalTools,
  type LocalTool,
  type LocalToolSource,
  type ToolCheck,
} from './tools.ts';

/** Options of `ToolCalling`. */
export interface ToolCallingOptions {
  /**
   * Tools that run in the agent, or sources like `new McpTools({ url })` read at the start of
   * every run. The client's tools (`input.tools`) are offered too; one of the same name wins.
   */
  readonly localTools?: readonly (LocalTool | LocalToolSource)[];
  /**
   * Most model calls in one run, counting the ones after tool results. Default 5. A run that
   * uses them up ends after the last tools ran: `ToolCallingAgent` then yields a `step-limit`
   * part.
   */
  readonly maxSteps?: number;
  /**
   * Checks of tools' arguments beyond their schemas, for example `new SandboxedUiCheck()` of
   * `/copilotkit`. A failed check is fixed like a schema error.
   */
  readonly checks?: readonly ToolCheck[];
  /** Your own last-chance fix of a broken call. */
  readonly repairHook?: RepairOptions['hook'];
}

/**
 * What `ToolCalling.start()` reads at the start of an agent run. `BrowserModelsAgent` passes
 * its `ToolsRun`, whose `input` is the AG-UI run input; only its tools are read.
 */
export interface ToolCallingRun {
  /** The client's tools: the client runs them. */
  readonly input: { readonly tools: readonly ToolSpec[] };
  readonly engine: Engine;
  /** Aborts when the run is stopped. */
  readonly signal: AbortSignal;
}

/**
 * Tool calling for `BrowserModelsAgent`: the client's tools and the agent's own, offered to the
 * model in the system prompt. Every call is repaired and checked against its schema (see
 * `ToolCallRepair`); the agent's tools run here, the client's tools in the client.
 *
 * ```ts
 * new BrowserModelsAgent({ models, defaultModel: 'gemma', tools: new ToolCalling({ localTools }) });
 * ```
 *
 * Nothing here needs AG-UI: the agent's `Tools` interface is met by shape. On an engine without
 * the agent, use `ToolCallingAgent`.
 */
export class ToolCalling {
  readonly #options: ToolCallingOptions;

  constructor(options: ToolCallingOptions = {}) {
    this.#options = options;
  }

  /** The tools of one agent run: the client's tools and the local ones. */
  start({ input, engine, signal }: ToolCallingRun): Promise<RunTools> {
    return this.#activate(input.tools, engine, signal);
  }

  async #activate(
    clientTools: readonly ToolSpec[],
    engine: Engine,
    signal: AbortSignal,
  ): Promise<ActiveTools> {
    const { localTools = [], maxSteps = 5, checks, repairHook } = this.#options;
    const resolved = await resolveLocalTools(localTools, signal);
    // A client tool wins over a local tool of the same name (CopilotKit can also publish its
    // tools to WebMCP, so the same tool may arrive both ways).
    const clientNames = new Set(clientTools.map((tool) => tool.name));
    const local = resolved.tools.filter((tool) => !clientNames.has(tool.name));
    return new ActiveTools({
      tools: [...clientTools, ...local],
      local,
      errors: resolved.errors,
      maxSteps,
      engine,
      signal,
      ...(checks ? { checks } : {}),
      ...(repairHook ? { hook: repairHook } : {}),
    });
  }
}
