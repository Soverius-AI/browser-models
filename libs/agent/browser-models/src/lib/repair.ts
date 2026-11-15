import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';
import type { JsonSchema } from './engine.ts';
import { ArgumentsSchema } from './schema.ts';
import type { ToolCall, ToolSpec } from './tools.ts';

/** How a broken tool call was fixed, in the order the steps ran. */
export type RepairStep = 'json' | 'name' | 'coerce' | 'reask' | 'hook';

export type RepairResult =
  | {
      readonly ok: true;
      readonly call: ToolCall;
      readonly steps: readonly RepairStep[];
    }
  | { readonly ok: false; readonly error: string };

export interface RepairOptions {
  /**
   * Asks the model once more for valid arguments. Returns the new raw arguments
   * text (or a whole call), or undefined when the engine cannot be asked again.
   */
  readonly reask?: (
    tool: ToolSpec,
    error: string,
    /** The raw call that had the error. */
    raw: string,
  ) => Promise<string | undefined>;
  /** Your own last-chance fix. Return a call to use it, or undefined to give up. */
  readonly hook?: (input: {
    readonly raw: string;
    readonly error: string;
    readonly tools: readonly ToolSpec[];
  }) => Promise<ToolCall | undefined> | ToolCall | undefined;
}

const jsonObject = z.record(z.string(), z.unknown());
/** A tool call as models write it. Some say `parameters` for `arguments`. */
const callEnvelope = z.looseObject({
  name: z.string(),
  arguments: z.unknown().optional(),
  parameters: z.unknown().optional(),
});
/** For tools without parameters. One object, so its compiled schema is reused. */
const anyObject: JsonSchema = { type: 'object' };

/**
 * Turns the raw text of a tool call into a valid call for one of `tools`. Steps, stopping at
 * the first success: JSON repair (jsonrepair) → tool name repair → schema coercion → re-ask
 * the model → user hook.
 */
export class ToolCallRepair {
  readonly #tools: readonly ToolSpec[];
  readonly #options: RepairOptions;

  constructor(tools: readonly ToolSpec[], options: RepairOptions = {}) {
    this.#tools = tools;
    this.#options = options;
  }

  /** Repairs one complete call. */
  async repair(raw: string): Promise<RepairResult> {
    const result = await this.#tryRepair(raw);
    const hook = this.#options.hook;
    if (result.ok || !hook) return result;

    // A failing hook must not end the run: the model is told the error instead.
    let fixed: ToolCall | undefined;
    try {
      fixed = await hook({ raw, error: result.error, tools: this.#tools });
    } catch {
      return result;
    }
    // Earlier steps did not lead to this call, so only the hook is reported.
    return fixed ? { ok: true, call: fixed, steps: ['hook'] } : result;
  }

  /**
   * Reads a call the model is still writing, so it can be shown while it streams. Returns
   * nothing until the name is complete and (after name repair) a known tool. `argumentsJson`
   * is the start of the arguments JSON that is already certain. It is a preview only: the
   * complete call still goes through `repair`.
   */
  readPartial(
    raw: string,
  ): { readonly name: string; readonly argumentsJson: string } | undefined {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonrepair(raw));
    } catch {
      return undefined;
    }
    const call = callEnvelope.safeParse(parsed).data;
    // The name is complete once another key follows it.
    const keys = Object.keys(jsonObject.safeParse(parsed).data ?? {});
    if (!call || keys.at(-1) === 'name') return undefined;
    const tool = findTool(call.name, this.#tools);
    if (!tool) return undefined;

    const args = jsonObject.safeParse(call.arguments ?? call.parameters);
    return {
      name: tool.name,
      argumentsJson: args.success
        ? certainStart(JSON.stringify(args.data), raw)
        : '',
    };
  }

  async #tryRepair(raw: string): Promise<RepairResult> {
    const steps: RepairStep[] = [];
    const call = callEnvelope.safeParse(parseJson(raw, steps)).data;
    if (!call) {
      return {
        ok: false,
        error: 'The tool call must be a JSON object with a "name".',
      };
    }

    const tool = findTool(call.name, this.#tools);
    if (!tool) {
      const names = this.#tools.map((t) => t.name).join(', ');
      return {
        ok: false,
        error: `Unknown tool "${call.name}". Available tools: ${names}.`,
      };
    }
    if (tool.name !== call.name) steps.push('name');

    let args = parseArguments(call.arguments ?? call.parameters ?? {}, steps);
    let check = checkArguments(args, tool);

    if (check.errors.length > 0 && this.#options.reask) {
      // A failing re-ask (for example an engine that rejects the schema as a constraint)
      // must not end the run: the model is told the error instead.
      let answer: string | undefined;
      try {
        answer = await this.#options.reask(tool, check.errors.join('; '), raw);
      } catch {
        answer = undefined;
      }
      if (answer !== undefined) {
        args = unwrapCall(parseArguments(answer, steps));
        check = checkArguments(args, tool);
        steps.push('reask');
      }
    }
    if (check.errors.length > 0) {
      return {
        ok: false,
        error: `Invalid arguments for "${tool.name}": ${check.errors.join('; ')}.`,
      };
    }
    if (check.coerced) steps.push('coerce');
    return {
      ok: true,
      call: { name: tool.name, arguments: check.value },
      steps,
    };
  }
}

/**
 * The start of `json` (the arguments jsonrepair made of the unfinished `raw`) that stays the
 * same when the rest of the call arrives. jsonrepair closes what is open and guesses the
 * unfinished end: half a key becomes `"key":null`, half a `true` becomes the string "tr".
 */
function certainStart(json: string, raw: string): string {
  const open = json.replace(/[\]}]+$/, '');
  const quotes = raw.replace(/\\./g, '').split('"').length - 1;
  if (open.endsWith('"')) {
    // Inside a string value: all of it but the closing quote is certain.
    if (quotes % 2 === 1) return open.slice(0, -1);
    // A finished string, unless the raw text ends in a bare word such as `tr`.
    if (!/\w$/.test(raw)) return open;
  }
  // A number, literal or key that may still grow: drop the whole last entry.
  return open.slice(
    0,
    Math.max(
      open.lastIndexOf(','),
      open.lastIndexOf('{') + 1,
      open.lastIndexOf('[') + 1,
    ),
  );
}

function checkArguments(args: unknown, tool: ToolSpec) {
  const check = ArgumentsSchema.of(tool.parameters ?? anyObject).check(args);
  return { ...check, value: jsonObject.safeParse(check.value).data ?? {} };
}

function parseJson(text: string, steps: RepairStep[]): unknown {
  try {
    return JSON.parse(text);
  } catch {
    try {
      const value: unknown = JSON.parse(jsonrepair(text));
      steps.push('json');
      return value;
    } catch {
      return undefined;
    }
  }
}

/** A re-ask may be answered with a whole call (`{name, arguments}`) instead of the arguments. */
function unwrapCall(value: unknown): unknown {
  const call = callEnvelope.safeParse(value).data;
  return call ? (call.arguments ?? call.parameters ?? value) : value;
}

function parseArguments(value: unknown, steps: RepairStep[]): unknown {
  // Some models send the arguments object as a JSON string.
  return typeof value === 'string' ? parseJson(value, steps) : value;
}

/** Exact name first, then the same name in other spelling, then one unambiguous typo. */
function findTool(
  name: string,
  tools: readonly ToolSpec[],
): ToolSpec | undefined {
  const exact = tools.find((tool) => tool.name === name);
  if (exact) return exact;

  const wanted = normalize(name);
  const sameName = tools.filter((tool) => normalize(tool.name) === wanted);
  if (sameName.length === 1) return sameName[0];

  const close = tools.filter(
    (tool) => editDistance(normalize(tool.name), wanted) <= 2,
  );
  return close.length === 1 ? close[0] : undefined;
}

/** "functions.getWeather", "get-weather" and "GET_WEATHER" all become "getweather". */
function normalize(name: string): string {
  return name
    .replace(/^functions\./, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
