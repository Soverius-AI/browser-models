import type { RunAgentInput } from '@ag-ui/core';
import type {
  ChatMessage,
  Engine,
  JsonSchema,
} from '@soverius-ai/browser-models';

/** What the model needs to know about a tool. */
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  /** JSON Schema of the arguments object. */
  readonly parameters?: JsonSchema;
}

/** A tool call after parsing and repair. */
export interface ToolCall {
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

/** How a broken tool call was fixed, in the order the steps ran. */
export type RepairStep = 'json' | 'name' | 'coerce' | 'reask' | 'hook';

/** A finished tool call, checked: a valid call, or what is wrong with it for the model. */
export type CheckedCall =
  | {
      readonly ok: true;
      readonly call: ToolCall;
      readonly steps: readonly RepairStep[];
    }
  | { readonly ok: false; readonly error: string };

/**
 * Tool calling for the agent. Without it the agent only chats: the client's tools are not
 * offered to the model. `ToolCalling` of `@soverius-ai/browser-models-tools` implements it.
 */
export interface Tools {
  /** Called at the start of every run, before the model is loaded. */
  start(run: ToolsRun): Promise<RunTools>;
}

/** What `Tools.start()` gets at the start of a run. */
export interface ToolsRun {
  /** `input.tools` are the client's tools: the client runs them. */
  readonly input: RunAgentInput;
  readonly engine: Engine;
  /** Aborts when the run is stopped. */
  readonly signal: AbortSignal;
}

/** The tools of one run. */
export interface RunTools {
  /** Every tool the model may call. */
  readonly tools: readonly ToolSpec[];
  /** How to call them, for the system prompt. */
  readonly instructions: string | undefined;
  /** Problems to report to the client, for example a tool source that could not be read. */
  readonly errors: readonly string[];
  /** Most model calls in the run, counting the ones after tool results. */
  readonly maxSteps: number;
  /** Name and arguments so far of a call the model is still writing, once they can be read. */
  readPartial(
    raw: string,
  ): { readonly name: string; readonly argumentsJson: string } | undefined;
  /**
   * Parses, repairs and checks a call the model has finished writing. `prompt` is what the
   * model got, so it can be asked again.
   */
  check(raw: string, prompt: readonly ChatMessage[]): Promise<CheckedCall>;
  /** Runs a tool of the agent and returns its result for the model. Undefined: a client tool. */
  run(call: ToolCall): Promise<string> | undefined;
}
