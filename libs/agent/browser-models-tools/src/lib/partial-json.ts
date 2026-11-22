/** JSON that was cut off somewhere, closed so it can be parsed. */
export interface ClosedJson {
  /** Valid JSON, or `''` when nothing complete has arrived yet. */
  readonly json: string;
  /** True when the cut is inside a string value: that string may still grow. */
  readonly inString: boolean;
}

/**
 * Closes JSON that a model is still writing, keeping only what is certain.
 *
 * A string value that is cut off is kept as far as it goes. Anything else that is unfinished is
 * left out: half a key, a key without its value, a number or literal that may still grow.
 * Brackets and braces inside strings are text, not structure, so code in a string is safe.
 *
 * ```ts
 * closeJson('{"city": "Vie');           // {"city": "Vie"}
 * closeJson('{"city": "Vienna", "da');  // {"city": "Vienna"}
 * closeJson('{"days": 1');              // {}   (could become 12)
 * ```
 */
export function closeJson(text: string): ClosedJson {
  /** The closing characters still owed, innermost last. */
  const open: string[] = [];
  /** How far the text is complete, and what closes it there. */
  let complete = { end: 0, closers: '' };
  let inString = false;
  let isKey = false;
  /** Where an escape sequence that is not finished yet starts. */
  let escapeStart = -1;
  let hexDigits = 0;
  /** In an object: the next string is a key. */
  let expectKey = false;

  const closers = () => [...open].reverse().join('');
  const valueEnds = (end: number) => {
    complete = { end, closers: closers() };
  };

  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    if (inString) {
      if (hexDigits > 0) {
        if (--hexDigits === 0) escapeStart = -1;
      } else if (escapeStart >= 0) {
        if (char === 'u') hexDigits = 4;
        else escapeStart = -1;
      } else if (char === '\\') {
        escapeStart = i;
      } else if (char === '"') {
        inString = false;
        if (!isKey) valueEnds(i + 1);
      }
    } else if (char === '"') {
      inString = true;
      isKey = expectKey;
      expectKey = false;
    } else if (char === '{' || char === '[') {
      open.push(char === '{' ? '}' : ']');
      expectKey = char === '{';
      // An empty object or array is complete as it is.
      valueEnds(i + 1);
    } else if (char === '}' || char === ']') {
      open.pop();
      expectKey = false;
      valueEnds(i + 1);
    } else if (char === ',') {
      expectKey = open.at(-1) === '}';
    } else if (/[-\w.+]/.test(char)) {
      // A number or literal is complete only when something follows it.
      const end = i + (/^[-\w.+]+/.exec(text.slice(i))?.[0].length ?? 1);
      if (end < text.length) valueEnds(end);
      i = end - 1;
    }
  }

  if (inString && !isKey) {
    const end = escapeStart >= 0 ? escapeStart : text.length;
    return { json: text.slice(0, end) + '"' + closers(), inString: true };
  }
  return {
    json: text.slice(0, complete.end) + complete.closers,
    inString: false,
  };
}
