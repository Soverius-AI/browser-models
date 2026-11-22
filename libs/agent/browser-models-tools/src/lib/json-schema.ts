import {
  dereference,
  validate,
  type OutputUnit,
  type Schema,
  type SchemaDraft,
} from '@cfworker/json-schema';
import type { JsonSchema } from '@soverius-ai/browser-models';
import { asArray, asObject, asString, isObject } from './json.ts';

export type Path = readonly (string | number)[];

/** What is wrong at one place of a value, and what a fix can go by. */
export interface Issue {
  readonly path: Path;
  readonly message: string;
  /** A required key that is not given. */
  readonly missing?: true;
  /** The type the schema asks for, when the value has another one. */
  readonly expected?: string;
  /** The only values the schema allows here (`enum`, `const`). */
  readonly values?: readonly unknown[];
  /** Keys the schema does not allow in the object here. */
  readonly keys?: readonly string[];
  /** Why the value fits none of the alternatives (`anyOf`, `oneOf`). */
  readonly options?: readonly (readonly Issue[])[];
}

/** A `$ref` that leads back to itself must not be followed forever. */
const MAX_DEPTH = 64;

/** Errors that only say "something below is wrong". What is wrong follows them. */
const WRAPPERS = new Set([
  'properties',
  'patternProperties',
  'additionalProperties',
  'unevaluatedProperties',
  'items',
  'prefixItems',
  'additionalItems',
  'unevaluatedItems',
  '$ref',
  '$recursiveRef',
  'allOf',
  'if',
  'dependentSchemas',
]);

/** The wording of a limit. The other keywords are reported in the validator's words. */
const LIMITS: Readonly<Record<string, (limit: unknown) => string>> = {
  minimum: (limit) => `Too small: expected number to be >=${limit}`,
  maximum: (limit) => `Too big: expected number to be <=${limit}`,
  exclusiveMinimum: (limit) => `Too small: expected number to be >${limit}`,
  exclusiveMaximum: (limit) => `Too big: expected number to be <${limit}`,
  multipleOf: (step) => `Invalid number: must be a multiple of ${step}`,
  minLength: (limit) =>
    `Too small: expected string to have >=${limit} characters`,
  maxLength: (limit) =>
    `Too big: expected string to have <=${limit} characters`,
  minItems: (limit) => `Too small: expected array to have >=${limit} items`,
  maxItems: (limit) => `Too big: expected array to have <=${limit} items`,
  pattern: (source) => `Invalid string: must match pattern /${source}/`,
};

/**
 * Tells what is wrong with a value according to a JSON Schema (drafts 4, 7, 2019-09 and
 * 2020-12), in the form the fixes of `ArgumentsSchema` need. The checking itself is done by
 * `@cfworker/json-schema`.
 *
 * A schema it cannot read (a `$ref` that leads nowhere, a `pattern` that is no regular
 * expression) must not make a tool unusable: its value only has to be an object.
 */
export class JsonSchemaChecker {
  /** A copy: the validator writes its bookkeeping into the schema it is given. */
  readonly #schema: Schema | undefined;
  readonly #lookup: Record<string, Schema | boolean> = {};
  readonly #draft: SchemaDraft;

  constructor(schema: JsonSchema) {
    this.#draft = draftOf(schema);
    try {
      const copy = structuredClone(schema) as Schema;
      dereference(copy, this.#lookup);
      this.#schema = copy;
    } catch {
      // Not readable: see the class comment.
    }
  }

  /** What is wrong with `value`. Empty when it is valid. */
  issues(value: unknown): Issue[] {
    try {
      if (this.#schema)
        return this.#convert(this.#validate(this.#schema, value).errors, value);
    } catch {
      // Not readable: see the class comment.
    }
    return isObject(value) ? [] : [wrongType([], ['object'], value)];
  }

  /**
   * Adds the `default` of every key that is not given to `value`, which must be valid. They
   * go after the given keys. True when one was added.
   */
  addDefaults(value: unknown): boolean {
    try {
      return this.#fill(this.#schema, value, 0);
    } catch {
      return false;
    }
  }

  #validate(schema: Schema | boolean, value: unknown) {
    return validate(value, schema, this.#draft, this.#lookup, false);
  }

  /** The validator's flat list of errors as issues. `root` is the value that was checked. */
  #convert(errors: readonly OutputUnit[], root: unknown): Issue[] {
    const issues: Issue[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < errors.length; index++) {
      const error = errors[index];
      if (!error || WRAPPERS.has(error.keyword)) continue;
      const { keyword, keywordLocation, error: message } = error;
      const path = pathOf(error.instanceLocation, root);
      const value = read(root, path);
      const rule = this.#schemaAt(keywordLocation);

      if (keyword === 'anyOf' || keyword === 'oneOf') {
        // The errors of every alternative follow, each under `…/anyOf/<number>/`. A `false`
        // schema reports the place of the value instead: it belongs to the error before it.
        const options: OutputUnit[][] = [];
        const prefix = `${keywordLocation}/`;
        let option = 0;
        for (
          let next = errors[index + 1];
          next &&
          (next.keyword === 'false' || next.keywordLocation.startsWith(prefix));
          next = errors[++index + 1]
        ) {
          if (next.keyword !== 'false')
            option = parseInt(next.keywordLocation.slice(prefix.length), 10);
          (options[option] ??= []).push(next);
        }
        issues.push({
          path,
          options: Object.values(options).map((option) =>
            this.#convert(option, root),
          ),
          message,
        });
      } else if (keyword === 'type' && rule !== undefined) {
        issues.push(wrongType(path, asArray(rule) ?? [rule], value));
      } else if (keyword === 'enum' || keyword === 'const') {
        const values = keyword === 'enum' ? (asArray(rule) ?? []) : [rule];
        issues.push({ path, values, message: oneOf(values) });
      } else if (keyword === 'required') {
        // One error per missing key, all at the same place: the place is read once.
        const place = `${error.instanceLocation} ${keywordLocation}`;
        if (seen.has(place)) continue;
        seen.add(place);
        const properties = asObject(
          asObject(this.#schemaAt(keywordLocation, 1))?.['properties'],
        );
        for (const key of asArray(rule) ?? []) {
          // A key with a default is not missing: `addDefaults` gives it its value.
          const preset = asObject(properties?.[String(key)])?.['default'];
          if (typeof key !== 'string' || preset !== undefined) continue;
          if (!Object.hasOwn(asObject(value) ?? {}, key))
            issues.push({
              path: [...path, key],
              missing: true,
              message: `"${key}" is required`,
            });
        }
      } else if (keyword === 'false') {
        // Nothing is allowed here. A key of an object can be dropped, an array item cannot.
        const key = path.at(-1);
        const parent = path.slice(0, -1);
        issues.push(
          typeof key === 'string' && isObject(read(root, parent))
            ? {
                path: parent,
                keys: [key],
                message: `Unrecognized key: ${JSON.stringify(key)}`,
              }
            : {
                path,
                message: `Invalid input: expected never, received ${typeOf(value)}`,
              },
        );
      } else {
        issues.push({ path, message: LIMITS[keyword]?.(rule) ?? message });
      }
    }
    return issues;
  }

  /**
   * What the schema says at a keyword location such as `#/properties/unit/$ref/enum`, which
   * leads through references. `up` steps are left out at the end.
   */
  #schemaAt(location: string, up = 0): unknown {
    const segments = location.split('/').slice(1);
    let node: unknown = this.#schema;
    for (const segment of segments.slice(0, segments.length - up)) {
      const reference = this.#referenced(node);
      if (segment === '$ref' && reference !== undefined) node = reference;
      else if (typeof node === 'object' && node !== null)
        node = Reflect.get(node, decodePointer(segment));
      else return undefined;
    }
    return node;
  }

  /** The schema the `$ref` of `schema` names, if it has one. */
  #referenced(schema: unknown): Schema | boolean | undefined {
    const ref = asString(asObject(schema)?.['$ref']);
    if (ref === undefined) return undefined;
    // The validator notes the absolute form of each reference in the schema.
    const absolute = asString(Reflect.get(Object(schema), '__absolute_ref__'));
    return this.#lookup[absolute ?? ref];
  }

  #fill(schema: unknown, value: unknown, depth: number): boolean {
    if (!isObject(schema) || depth > MAX_DEPTH) return false;
    let filled = false;
    const below = (part: unknown, item: unknown) => {
      filled = this.#fill(part, item, depth + 1) || filled;
    };

    below(this.#referenced(schema), value);
    for (const part of asArray(schema['allOf']) ?? []) below(part, value);
    for (const keyword of ['anyOf', 'oneOf'])
      below(
        asArray(schema[keyword])?.find(
          (option) => this.#validate(option as Schema | boolean, value).valid,
        ),
        value,
      );

    if (Array.isArray(value)) {
      for (const item of value) below(schema['items'], item);
    } else if (isObject(value)) {
      const properties = asObject(schema['properties']) ?? {};
      for (const [key, property] of Object.entries(properties)) {
        const preset = asObject(property)?.['default'];
        if (Object.hasOwn(value, key)) {
          below(property, value[key]);
        } else if (preset !== undefined) {
          // Not an assignment: a key named `__proto__` must stay an ordinary key.
          Object.defineProperty(value, key, {
            value: structuredClone(preset),
            enumerable: true,
            writable: true,
            configurable: true,
          });
          filled = true;
        }
      }
    }
    return filled;
  }
}

/** The draft a schema names in `$schema`. MCP and WebMCP mean 2020-12 when it names none. */
function draftOf(schema: JsonSchema): SchemaDraft {
  const dialect = asString(schema['$schema']) ?? '';
  if (dialect.includes('draft-04')) return '4';
  if (dialect.includes('draft-06') || dialect.includes('draft-07')) return '7';
  return dialect.includes('2019-09') ? '2019-09' : '2020-12';
}

function wrongType(path: Path, types: readonly unknown[], value: unknown) {
  const names = types.map((type) => (type === 'integer' ? 'int' : type));
  return {
    path,
    expected: String(names.find((name) => name !== 'null') ?? 'null'),
    message: `Invalid input: expected ${names.join(' or ')}, received ${typeOf(value)}`,
  };
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

function oneOf(values: readonly unknown[]): string {
  const options = values.map((value) => JSON.stringify(value));
  return options.length === 1
    ? `Invalid input: expected ${options[0]}`
    : `Invalid option: expected one of ${options.join('|')}`;
}

/** An instance location such as `#/tags/1` as the keys that lead there in `root`. */
function pathOf(location: string, root: unknown): Path {
  let node = root;
  return location
    .split('/')
    .slice(1)
    .map((segment) => {
      const key = decodePointer(segment);
      const step = Array.isArray(node) ? Number(key) : key;
      node = read(node, [step]);
      return step;
    });
}

/** One step of a location as the key it stands for. The reverse of the validator's encoding. */
function decodePointer(segment: string): string {
  return decodeURI(segment.replace(/%23/g, '#'))
    .replace(/~1/g, '/')
    .replace(/~0/g, '~');
}

/** The value in `root` that `path` leads to. */
function read(root: unknown, path: Path): unknown {
  return path.reduce<unknown>(
    (node, key) =>
      typeof node === 'object' && node !== null
        ? Reflect.get(node, key)
        : undefined,
    root,
  );
}
