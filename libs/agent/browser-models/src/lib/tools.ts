import type { ChatMessage, JsonSchema } from './engine.ts';

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
 * The tools of one run, for a tool loop: `BrowserModelsAgent`'s or `ToolCallingAgent`'s.
 * `ToolCalling` of `@soverius-ai/browser-models-tools` makes them.
 */
export interface RunTools {
  /** Every tool the model may call. */
  readonly tools: readonly ToolSpec[];
  /** How to call them, for the system prompt. */
  readonly instructions: string | undefined;
  /** Problems to report, for example a tool source that could not be read. */
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
  /** Runs a tool of the run and returns its result for the model. Undefined: a client tool. */
  run(call: ToolCall): Promise<string> | undefined;
}
