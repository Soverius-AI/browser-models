import { closeJson } from './partial-json.ts';

/** True when `part` is what `whole` looks like while it is still being written. */
function isStartOf(part: unknown, whole: unknown): boolean {
  if (typeof part === 'string')
    return typeof whole === 'string' && whole.startsWith(part);
  if (Array.isArray(part))
    return (
      Array.isArray(whole) &&
      part.every((item, index) =>
        index < part.length - 1
          ? JSON.stringify(item) === JSON.stringify(whole[index])
          : isStartOf(item, whole[index]),
      )
    );
  if (part && typeof part === 'object') {
    const entries = Object.entries(part);
    return (
      !!whole &&
      typeof whole === 'object' &&
      entries.every(([key, value], index) => {
        const other = (whole as Record<string, unknown>)[key];
        return index < entries.length - 1
          ? JSON.stringify(value) === JSON.stringify(other)
          : isStartOf(value, other);
      })
    );
  }
  return part === whole;
}

describe('closeJson', () => {
  it('keeps a cut-off string value and leaves out what is unfinished', () => {
    expect(closeJson('{"city": "Vie')).toEqual({
      json: '{"city": "Vie"}',
      inString: true,
    });
    expect(closeJson('{"city": "Vienna", "da').json).toBe('{"city": "Vienna"}');
    expect(closeJson('{"city": "Vienna", "days":').json).toBe(
      '{"city": "Vienna"}',
    );
    // A number or literal may still grow.
    expect(closeJson('{"days": 1').json).toBe('{}');
    expect(closeJson('{"ok": tru').json).toBe('{}');
    expect(closeJson('{"days": 1, ').json).toBe('{"days": 1}');
    expect(closeJson('{"list": [1, {"a": nu').json).toBe('{"list": [1, {}]}');
    expect(closeJson('').json).toBe('');
  });

  it('does not end a string inside an escape sequence', () => {
    expect(closeJson('{"a": "x\\').json).toBe('{"a": "x"}');
    expect(closeJson('{"a": "x\\u00').json).toBe('{"a": "x"}');
    expect(closeJson('{"a": "say \\"hi').json).toBe('{"a": "say \\"hi"}');
  });

  it('gives valid JSON for every cut of a document, and never changes what was there', () => {
    const whole = {
      name: 'generateSandboxedUi',
      arguments: {
        initialHeight: 400,
        css: 'a { color: "red"; } .b, .c { top: 1px }',
        html: "<div class='x'>[1, 2] {a}</div>\n<p>é   \\ </p>",
        jsExpressions: [
          "new Chart(document.getElementById('c'), { type: 'bar', data: [1, 2] })",
          'run({ "a": [true, null] })',
        ],
        nested: { empty: {}, list: [[], [1.5e3, -2], { deep: 'value' }] },
        ok: false,
      },
    };
    for (const text of [
      JSON.stringify(whole),
      JSON.stringify(whole, null, 2),
    ]) {
      for (let length = 1; length <= text.length; length++) {
        const { json } = closeJson(text.slice(0, length));
        if (json) expect(isStartOf(JSON.parse(json), whole)).toBe(true);
      }
      expect(JSON.parse(closeJson(text).json)).toEqual(whole);
    }
  });
});
