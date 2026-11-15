import { z } from 'zod';
import type { JsonSchema } from './engine.ts';

export interface SchemaCheck {
  /** The value after safe coercions such as "5" → 5. */
  readonly value: unknown;
  /** Human-readable problems. Empty means the value is valid. */
  readonly errors: readonly string[];
  /** True when coercion changed the value. */
  readonly coerced: boolean;
}

type Issue = z.core.$ZodIssue;

/** How often the mistakes zod reports are fixed before the rest is reported. */
const MAX_FIXES = 3;
/** An object or array: something a zod issue path can lead into. */
const container = z.instanceof(Object);
const compiled = new WeakMap<JsonSchema, ArgumentsSchema>();

/**
 * Checks tool arguments against the tool's JSON Schema with zod (`z.fromJSONSchema`) and
 * fixes the safe mistakes small models make: "5" → 5, "true" → true, 5 → "5", value → [value],
 * wrong enum case, `null` for "not given" and keys the schema does not allow.
 */
export class ArgumentsSchema {
  readonly #schema: z.ZodType;

  /** The compiled schema, made once per JSON Schema object. */
  static of(json: JsonSchema): ArgumentsSchema {
    let schema = compiled.get(json);
    if (!schema) compiled.set(json, (schema = new ArgumentsSchema(json)));
    return schema;
  }

  constructor(json: JsonSchema) {
    try {
      this.#schema = z.fromJSONSchema(json);
    } catch {
      // JSON Schema that zod cannot read (`not`, `if`/`then`, external `$ref`) must not make
      // the tool unusable: its arguments only have to be an object.
      this.#schema = z.record(z.string(), z.unknown());
    }
  }

  check(input: unknown): SchemaCheck {
    const value: unknown = structuredClone(input);
    let coerced = false;
    for (let pass = 0; ; pass++) {
      const result = this.#schema.safeParse(value);
      if (result.success) {
        // zod orders keys as the schema does. Arguments that were already sent to the client
        // must keep their order, so its copy is only used when it has more: the defaults.
        const filled = size(result.data) !== size(value);
        return {
          value: filled ? result.data : value,
          errors: [],
          coerced: coerced || filled,
        };
      }
      const { issues } = result.error;
      const fixed =
        pass < MAX_FIXES && issues.filter((issue) => fix(value, issue)).length;
      if (!fixed) {
        const errors = issues.map((issue) => describe(value, issue));
        return { value, errors, coerced };
      }
      coerced = true;
    }
  }
}

function size(value: unknown): number {
  return JSON.stringify(value)?.length ?? 0;
}

/** Fixes in `root` what `issue` reports. False when there is no safe fix. */
function fix(root: unknown, issue: Issue): boolean {
  if (issue.code === 'unrecognized_keys') {
    // Drop keys the schema does not allow instead of failing the whole call.
    const target = container.safeParse(read(root, issue.path)).data;
    return (
      target !== undefined &&
      issue.keys.every((key) => Reflect.deleteProperty(target, key))
    );
  }
  const key = issue.path.at(-1);
  const parent = container.safeParse(read(root, issue.path.slice(0, -1))).data;
  if (key === undefined || parent === undefined) return false;

  const current: unknown = Reflect.get(parent, key);
  // Small models send null for "not given". A required key is reported as missing next.
  if (current === null && typeof key === 'string')
    return Reflect.deleteProperty(parent, key);

  let next = current;
  if (issue.code === 'invalid_type') next = retype(current, issue.expected);
  if (issue.code === 'invalid_value' && typeof current === 'string') {
    const wanted = current.toLowerCase();
    next = issue.values.find(
      (option) => typeof option === 'string' && option.toLowerCase() === wanted,
    );
  }
  return (
    next !== undefined && next !== current && Reflect.set(parent, key, next)
  );
}

/** `value` as the type the schema expects, or unchanged when that is not safe. */
function retype(value: unknown, expected: string): unknown {
  if (value === undefined) return value;
  switch (expected) {
    case 'number':
    case 'int':
      return typeof value === 'string' &&
        value.trim() !== '' &&
        !Number.isNaN(Number(value))
        ? Number(value)
        : value;
    case 'boolean':
      return value === 'true' ? true : value === 'false' ? false : value;
    case 'string':
      return typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : value;
    case 'array':
      return [value];
    default:
      return value;
  }
}

/** The problem for the model's next attempt, for example `arguments.days: expected int`. */
function describe(root: unknown, issue: Issue): string {
  const path = issue.path.reduce<string>(
    (text, key) =>
      typeof key === 'number' ? `${text}[${key}]` : `${text}.${String(key)}`,
    'arguments',
  );
  if (issue.code === 'invalid_type' && read(root, issue.path) === undefined)
    return `${path} is required`;
  if (issue.code === 'invalid_union') {
    // "Invalid input" alone says nothing: name what each alternative expects.
    const options = issue.errors.flatMap((option) => option[0]?.message ?? []);
    if (options.length > 0) return `${path}: ${options.join(', or ')}`;
  }
  return `${path}: ${issue.message}`;
}

/** The value in `root` that a zod issue path leads to. */
function read(root: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>((node, key) => {
    const parent = container.safeParse(node).data;
    return parent && Reflect.get(parent, key);
  }, root);
}
