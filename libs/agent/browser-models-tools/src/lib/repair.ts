import type {
  CheckedCall,
  JsonSchema,
  RepairStep,
  ToolCall,
  ToolSpec,
} from '@soverius-ai/browser-models';
import { jsonrepair } from 'jsonrepair';
import { asObject } from './json.ts';
import { closeJson } from './partial-json.ts';
import { ArgumentsSchema } from './schema.ts';
import type { ToolCheck } from './tools.ts';

export type { RepairStep } from '@soverius-ai/browser-models';
/** A repaired call and the steps it took, or why it cannot be repaired. */
export type RepairResult = CheckedCall;

/** Options of `ToolCallRepair`. */
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
  /** Checks after the schema; a failed one is fixed like a schema error. */
  readonly checks?: readonly ToolCheck[];
  /** Your own last-chance fix. Return a call to use it, or undefined to give up. */
  readonly hook?: (input: {
    readonly raw: string;
    readonly error: string;
    readonly tools: readonly ToolSpec[];
  }) => Promise<ToolCall | undefined> | ToolCall | undefined;
}

/** A tool call as models write it. Some say `parameters` for `arguments`. */
interface CallEnvelope {
  readonly name: string;
  readonly arguments?: unknown;
  readonly parameters?: unknown;
}
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
    raw = asEnvelope(raw, false) ?? raw;
    // Well-formed JSON is closed exactly. JSON that needs repair (single quotes, bare keys) is
    // read with jsonrepair, which has to guess: the arguments are then only a likely preview.
    const closed = closeJson(raw);
    const exact = parse(closed.json);
    const parsed = exact ?? parse(() => jsonrepair(raw));
    const call = readCall(parsed);
    if (!call) return undefined;
    // The model is still writing the name itself.
    const lastKey = Object.keys(asObject(parsed) ?? {}).at(-1);
    if (lastKey === 'name' && (exact === undefined || closed.inString))
      return undefined;
    const tool = findTool(call.name, this.#tools);
    if (!tool) return undefined;

    const args = asObject(call.arguments ?? call.parameters);
    if (!args) return { name: tool.name, argumentsJson: '' };
    const json = JSON.stringify(args);
    if (exact === undefined)
      return { name: tool.name, argumentsJson: certainStart(json, raw) };
    // What is still open gets closed later: leave the closing characters out.
    const start = json.replace(/[\]}]+$/, '');
    return {
      name: tool.name,
      argumentsJson: closed.inString ? start.slice(0, -1) : start,
    };
  }

  async #tryRepair(written: string): Promise<RepairResult> {
    const steps: RepairStep[] = [];
    const envelope = asEnvelope(written, true);
    if (envelope !== undefined) steps.push('json');
    const raw = envelope ?? written;
    const call = readCall(parseJson(raw, steps));
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
        error: `Unknown tool "${call.name}". Call it again with the exact name of one of these tools: ${names}.`,
      };
    }
    if (tool.name !== call.name) steps.push('name');

    let args = parseArguments(call.arguments ?? call.parameters ?? {}, steps);
    let check = this.#check(args, tool);

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
        check = this.#check(args, tool);
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

  /** The schema check, then the tool's own checks once the schema holds. */
  #check(args: unknown, tool: ToolSpec) {
    const check = checkArguments(args, tool);
    if (check.errors.length > 0) return check;
    const errors = (this.#options.checks ?? [])
      .filter((own) => own.tool === tool.name)
      .flatMap((own) => ToolCallRepair.#ask(own, check.value) ?? []);
    return { ...check, errors };
  }

  /** A check that throws must not end the run: it is skipped, the call counts as fine. */
  static #ask(
    check: ToolCheck,
    args: Readonly<Record<string, unknown>>,
  ): string | undefined {
    try {
      return check.check(args);
    } catch {
      return undefined;
    }
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

/**
 * A call written as the tool's name, then its arguments: `name` on a line and the arguments
 * object below it, or `name({...})`. Small models write this instead of the
 * `{"name", "arguments"}` object. Returns it as that object, or undefined for any other text.
 * `complete`: the call is finished, so the object is closed too.
 */
function asEnvelope(raw: string, complete: boolean): string | undefined {
  const match = /^\s*([A-Za-z_][\w.:-]*)\s*(\(?)\s*(\{[\s\S]*)$/.exec(raw);
  if (!match) return undefined;
  const [, name = '', parenthesized, rest = ''] = match;
  const args = parenthesized ? rest.replace(/\)\s*$/, '') : rest;
  return `{"name": ${JSON.stringify(name)}, "arguments": ${args}${complete ? '}' : ''}`;
}

/** The call in `value`, when it is an object with a name. */
function readCall(value: unknown): CallEnvelope | undefined {
  const call = asObject(value);
  const name = call?.['name'];
  return call && typeof name === 'string' ? { ...call, name } : undefined;
}

/** The parsed JSON, or undefined when it is not valid JSON. */
function parse(json: string | (() => string)): unknown {
  try {
    return JSON.parse(typeof json === 'string' ? json : json());
  } catch {
    return undefined;
  }
}

function checkArguments(args: unknown, tool: ToolSpec) {
  const check = ArgumentsSchema.of(tool.parameters ?? anyObject).check(args);
  return { ...check, value: asObject(check.value) ?? {} };
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
  const call = readCall(value);
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

/**
 * "functions.getWeather", "default_api.getWeather" (Gemini), "getWeather()", "get-weather" and
 * "GET_WEATHER" all become "getweather".
 */
function normalize(name: string): string {
  return name
    .trim()
    .replace(/\(.*$/s, '')
    .replace(/^.*\./, '')
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
