/** A JSON object: `{…}`, not an array and not null. */
export type JsonObject = Record<string, unknown>;

// Data from models, pages and servers has any shape. These read the one that is expected and
// answer undefined for everything else, so a caller never works with a value it did not check.

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asObject(value: unknown): JsonObject | undefined {
  return isObject(value) ? value : undefined;
}

export function asArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
