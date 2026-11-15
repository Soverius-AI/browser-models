import type { JsonSchema } from './engine.ts';
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

  it('only asks for an object when zod cannot read the schema', () => {
    const json = { type: 'object', not: { required: ['city'] } };
    expect(checkSchema({ days: '3' }, json)).toEqual({
      value: { days: '3' },
      errors: [],
      coerced: false,
    });
    expect(checkSchema('Vienna', json).errors).toEqual([
      'arguments: Invalid input: expected record, received string',
    ]);
  });

  it('compiles a schema once', () => {
    expect(ArgumentsSchema.of(schema)).toBe(ArgumentsSchema.of(schema));
  });
});
