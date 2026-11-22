import type { JsonSchema } from '@soverius-ai/browser-models';
import { JsonSchemaChecker, type Issue, type Path } from './json-schema.ts';

/** The result of `ArgumentsSchema.check()`. */
export interface SchemaCheck {
  /** The value after safe coercions such as "5" → 5. */
  readonly value: unknown;
  /** Human-readable problems. Empty means the value is valid. */
  readonly errors: readonly string[];
  /** True when coercion changed the value. */
  readonly coerced: boolean;
}

/** How often the reported mistakes are fixed before the rest is reported. */
const MAX_FIXES = 3;
const compiled = new WeakMap<JsonSchema, ArgumentsSchema>();

/**
 * Checks tool arguments against the tool's JSON Schema and fixes the safe mistakes small
 * models make: "5" → 5, "true" → true, 5 → "5", value → [value], wrong enum case, `null` for
 * "not given" and keys the schema does not allow. `JsonSchemaChecker` says which keywords of
 * the schema are checked.
 */
export class ArgumentsSchema {
  readonly #checker: JsonSchemaChecker;

  /** The checker of a JSON Schema object, made once. */
  static of(json: JsonSchema): ArgumentsSchema {
    let schema = compiled.get(json);
    if (!schema) compiled.set(json, (schema = new ArgumentsSchema(json)));
    return schema;
  }

  constructor(json: JsonSchema) {
    this.#checker = new JsonSchemaChecker(json);
  }

  /** Checks `input` and fixes the safe mistakes; `input` itself is not changed. */
  check(input: unknown): SchemaCheck {
    const value: unknown = structuredClone(input);
    let coerced = false;
    for (let pass = 0; ; pass++) {
      const issues = this.#checker.issues(value);
      if (issues.length === 0) {
        // Only valid arguments get the defaults. They go after the given keys: arguments
        // that were already sent to the client must keep their order.
        const filled = this.#checker.addDefaults(value);
        return { value, errors: [], coerced: coerced || filled };
      }
      const fixed =
        pass < MAX_FIXES && issues.filter((issue) => fix(value, issue)).length;
      if (!fixed) return { value, errors: issues.map(describe), coerced };
      coerced = true;
    }
  }
}

/** Fixes in `root` what `issue` reports. False when there is no safe fix. */
function fix(root: unknown, issue: Issue): boolean {
  if (issue.keys) {
    // Drop keys the schema does not allow instead of failing the whole call.
    const target = container(read(root, issue.path));
    return (
      target !== undefined &&
      issue.keys.every((key) => Reflect.deleteProperty(target, key))
    );
  }
  const key = issue.path.at(-1);
  const parent = container(read(root, issue.path.slice(0, -1)));
  if (key === undefined || parent === undefined) return false;

  const current: unknown = Reflect.get(parent, key);
  // Small models send null for "not given". A required key is reported as missing next.
  if (current === null && typeof key === 'string')
    return Reflect.deleteProperty(parent, key);

  let next = current;
  if (issue.expected) next = retype(current, issue.expected);
  if (issue.values && typeof current === 'string') {
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
function describe(issue: Issue): string {
  const path = issue.path.reduce<string>(
    (text, key) =>
      typeof key === 'number' ? `${text}[${key}]` : `${text}.${key}`,
    'arguments',
  );
  if (issue.missing) return `${path} is required`;
  // "Invalid input" alone says nothing: name what each alternative expects.
  const options = issue.options?.flatMap((option) => option[0]?.message ?? []);
  return `${path}: ${options?.length ? options.join(', or ') : issue.message}`;
}

/** An object or array: something an issue path can lead into. */
function container(value: unknown): object | undefined {
  return typeof value === 'object' && value !== null ? value : undefined;
}

/** The value in `root` that an issue path leads to. */
function read(root: unknown, path: Path): unknown {
  return path.reduce<unknown>((node, key) => {
    const parent = container(node);
    return parent && Reflect.get(parent, key);
  }, root);
}
