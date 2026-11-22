import type { JsonSchema } from '@soverius-ai/browser-models';
import { ArgumentsSchema } from './schema.ts';

const schema = {
  type: 'object',
  properties: {
    city: { type: 'string' },
    days: { type: 'integer', default: 1 },
    unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['city'],
  additionalProperties: false,
} as const;

function checkSchema(value: unknown, json: JsonSchema) {
  return ArgumentsSchema.of(json).check(value);
}

describe('ArgumentsSchema', () => {
  it('accepts valid arguments unchanged', () => {
    const check = checkSchema({ city: 'Vienna', days: 3 }, schema);
    expect(check).toEqual({
      value: { city: 'Vienna', days: 3 },
      errors: [],
      coerced: false,
    });
  });

  it('coerces safe mistakes', () => {
    const check = checkSchema(
      { city: 'Vienna', days: '3', unit: 'Celsius', tags: 'rain' },
      schema,
    );
    expect(check.errors).toEqual([]);
    expect(check.coerced).toBe(true);
    expect(check.value).toEqual({
      city: 'Vienna',
      days: 3,
      unit: 'celsius',
      tags: ['rain'],
    });
  });

  it('fills defaults', () => {
    expect(checkSchema({ city: 'Vienna' }, schema).value).toEqual({
      city: 'Vienna',
      days: 1,
    });
  });

  it('reports what is wrong', () => {
    const check = checkSchema({ days: 1.5, unit: 'kelvin' }, schema);
    expect(check.errors).toEqual([
      'arguments.city is required',
      'arguments.days: Invalid input: expected int, received number',
      'arguments.unit: Invalid option: expected one of "celsius"|"fahrenheit"',
    ]);
  });

  it('drops keys the schema does not allow, and null for optional keys', () => {
    const check = checkSchema(
      { city: 'Vienna', unit: null, extra: true },
      schema,
    );
    expect(check.errors).toEqual([]);
    expect(check.coerced).toBe(true);
    expect(check.value).toEqual({ city: 'Vienna', days: 1 });
  });

  it('does not change the value it is given, or its key order', () => {
    const input = { days: '3', city: 'Vienna' };
    const check = checkSchema(input, schema);
    expect(input.days).toBe('3');
    expect(JSON.stringify(check.value)).toBe('{"days":3,"city":"Vienna"}');
  });

  it.each([
    ['a string to a number', { type: 'number' }, '2.5', 2.5],
    ['a string to an integer', { type: 'integer' }, ' 7 ', 7],
    ['a string to a boolean', { type: 'boolean' }, 'false', false],
    ['a number to a string', { type: 'string' }, 5, '5'],
    ['a boolean to a string', { type: 'string' }, true, 'true'],
    ['a value to an array', { type: 'array' }, { a: 1 }, [{ a: 1 }]],
    ['the case of an enum value', { enum: ['Low', 'HIGH'] }, 'high', 'HIGH'],
    [
      'a value to an array, then its items',
      { type: 'array', items: { type: 'integer' } },
      '4',
      [4],
    ],
    [
      'a string to a number that may be null',
      { type: ['integer', 'null'] },
      '5',
      5,
    ],
    [
      'nested objects',
      {
        type: 'object',
        properties: { on: { type: 'boolean' } },
        additionalProperties: false,
      },
      { on: 'true', extra: null },
      { on: true },
    ],
  ])('coerces %s', (_name, property, given, expected) => {
    const json = { type: 'object', properties: { key: property } };
    expect(checkSchema({ key: given }, json)).toEqual({
      value: { key: expected },
      errors: [],
      coerced: true,
    });
  });

  it.each([
    ['text for a number', { type: 'number' }, 'many', 'expected number'],
    ['a fraction for an integer', { type: 'integer' }, '1.5', 'expected int'],
    ['other text for a boolean', { type: 'boolean' }, 'yes', 'expected boole'],
    ['an object for a string', { type: 'string' }, {}, 'expected string'],
  ])('does not coerce %s', (_name, property, given, problem) => {
    const json = { type: 'object', properties: { key: property } };
    const { errors } = checkSchema({ key: given }, json);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`arguments.key: Invalid input: ${problem}`);
  });

  it('treats null for a required key as missing', () => {
    expect(checkSchema({ city: null }, schema).errors).toEqual([
      'arguments.city is required',
    ]);
  });

  it('names the place of a problem inside arrays', () => {
    const check = checkSchema({ city: 'Vienna', tags: ['rain', {}] }, schema);
    expect(check.errors).toEqual([
      'arguments.tags[1]: Invalid input: expected string, received object',
    ]);
  });

  it('checks limits, patterns, alternatives and references', () => {
    const json = {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1 },
        code: { type: 'string', pattern: '^[A-Z]{3}$' },
        id: { anyOf: [{ type: 'string' }, { type: 'number' }] },
        note: { type: ['string', 'null'] },
        unit: { $ref: '#/$defs/unit' },
      },
      $defs: { unit: { enum: ['celsius', 'fahrenheit'] } },
    };
    const valid = { days: 2, code: 'VIE', id: 7, note: null, unit: 'celsius' };
    expect(checkSchema(valid, json)).toEqual({
      value: valid,
      errors: [],
      coerced: false,
    });
    const check = checkSchema(
      { days: 0, code: 'vie', id: true, unit: 'Celsius' },
      json,
    );
    expect(check.value).toMatchObject({ unit: 'celsius' });
    expect(check.errors).toEqual([
      'arguments.days: Too small: expected number to be >=1',
      'arguments.code: Invalid string: must match pattern /^[A-Z]{3}$/',
      'arguments.id: Invalid input: expected string, received boolean, or Invalid input: expected number, received boolean',
    ]);
  });

  it.each([
    [
      'the length of a string',
      { type: 'string', minLength: 2, maxLength: 3 },
      'abc',
      'a',
      'arguments.key: Too small: expected string to have >=2 characters',
    ],
    [
      'the length of an array',
      { type: 'array', maxItems: 1 },
      [1],
      [1, 2],
      'arguments.key: Too big: expected array to have <=1 items',
    ],
    [
      'a limit the value must not reach',
      { type: 'number', exclusiveMinimum: 0 },
      0.5,
      0,
      'arguments.key: Too small: expected number to be >0',
    ],
    [
      'a step, also in floating point',
      { type: 'number', multipleOf: 0.1 },
      0.3,
      0.35,
      'arguments.key: Invalid number: must be a multiple of 0.1',
    ],
    [
      'a constant',
      { const: 'on' },
      'on',
      'off',
      'arguments.key: Invalid input: expected "on"',
    ],
    [
      'every part of allOf',
      { allOf: [{ type: 'number' }, { minimum: 1 }] },
      1,
      0,
      'arguments.key: Too small: expected number to be >=1',
    ],
    [
      'items by their position',
      { type: 'array', prefixItems: [{ type: 'string' }], items: false },
      ['a'],
      ['a', 'b'],
      'arguments.key[1]: Invalid input: expected never, received string',
    ],
    [
      'keys that are not listed',
      { type: 'object', additionalProperties: { type: 'boolean' } },
      { other: true },
      { other: 'yes' },
      'arguments.key.other: Invalid input: expected boolean, received string',
    ],
    [
      'a keyword that is reported in the words of the validator',
      { type: 'string', format: 'email' },
      'a@example.com',
      'nobody',
      'arguments.key: String does not match format "email".',
    ],
    [
      'a required key that is not listed',
      { type: 'object', required: ['id'] },
      { id: 1 },
      {},
      'arguments.key.id is required',
    ],
  ])('checks %s', (_name, property, valid, invalid, problem) => {
    const json = { type: 'object', properties: { key: property } };
    expect(checkSchema({ key: valid }, json)).toEqual({
      value: { key: valid },
      errors: [],
      coerced: false,
    });
    expect(checkSchema({ key: invalid }, json).errors).toEqual([problem]);
  });

  it('keeps the keys a pattern allows when other keys are not allowed', () => {
    const json = {
      type: 'object',
      properties: { id: { type: 'string' } },
      patternProperties: { '^x-': { type: 'number' } },
      additionalProperties: false,
    };
    expect(checkSchema({ id: 'a', 'x-rate': '2', other: 1 }, json)).toEqual({
      value: { id: 'a', 'x-rate': 2 },
      errors: [],
      coerced: true,
    });
  });

  it('follows a schema that refers to itself', () => {
    const json = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        children: { type: 'array', items: { $ref: '#' } },
      },
      required: ['name'],
    };
    const tree = { name: 'a', children: [{ name: 'b', children: [{}] }] };
    expect(checkSchema(tree, json).errors).toEqual([
      'arguments.children[0].children[0].name is required',
    ]);
  });

  it('adds defaults after the given keys, and only to valid arguments', () => {
    const valid = checkSchema({ unit: 'celsius', city: 'Vienna' }, schema);
    expect(JSON.stringify(valid.value)).toBe(
      '{"unit":"celsius","city":"Vienna","days":1}',
    );
    const invalid = checkSchema({ unit: 'kelvin', city: 'Vienna' }, schema);
    expect(invalid.value).toEqual({ unit: 'kelvin', city: 'Vienna' });
  });

  it('adds a default named __proto__ as an ordinary key', () => {
    const json: JsonSchema = JSON.parse(
      '{"type":"object","properties":{"__proto__":{"default":{"admin":true}}}}',
    );
    const { value } = checkSchema({}, json);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(JSON.stringify(value)).toBe('{"__proto__":{"admin":true}}');
  });

  it('does not drop a key because one alternative does not allow it', () => {
    const shape = (key: string) => ({
      type: 'object',
      properties: { [key]: { type: 'number' } },
      required: [key],
      additionalProperties: false,
    });
    const json = {
      type: 'object',
      properties: { shape: { anyOf: [shape('radius'), shape('side')] } },
    };
    const check = checkSchema({ shape: { side: 'wide' } }, json);
    expect(check.value).toEqual({ shape: { side: 'wide' } });
    expect(check.errors).toEqual([
      'arguments.shape: "radius" is required, or Invalid input: expected number, received string',
    ]);
  });

  it('only asks for an object when the schema cannot be read', () => {
    const json = { $ref: '#/$defs/none' };
    expect(checkSchema({ days: '3' }, json)).toEqual({
      value: { days: '3' },
      errors: [],
      coerced: false,
    });
    expect(checkSchema('Vienna', json).errors).toEqual([
      'arguments: Invalid input: expected object, received string',
    ]);
  });

  it.each([
    ['a reference to another document', { $ref: 'https://example.com/a.json' }],
    ['a reference that leads nowhere', { $ref: '#/$defs/none' }],
    ['a reference that leads to itself', { $ref: '#/properties/key' }],
    ['a pattern that is no regular expression', { pattern: '(' }],
  ])('does not check a schema with %s', (_name, property) => {
    const json = { type: 'object', properties: { key: property } };
    expect(checkSchema({ key: 'text' }, json)).toEqual({
      value: { key: 'text' },
      errors: [],
      coerced: false,
    });
  });

  it('makes the checker of a schema once', () => {
    expect(ArgumentsSchema.of(schema)).toBe(ArgumentsSchema.of(schema));
  });
});
