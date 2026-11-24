import { asArray, asString } from './json.ts';
import type { ToolCheck } from './tools.ts';

/** A string, kept as it is, or a comment, which is left out. */
const STRING_OR_COMMENT =
  /(['"`])(?:\\[\s\S]|(?!\1)[^\\])*\1|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
/**
 * An element a script looks up by id: `getElementById('x')`, `querySelector('#x …')`. With the
 * variable it is assigned to (1), the id (3 or 5) and what follows it (6): a use or a test.
 */
const LOOKUP =
  /(?:([\w$]+)\s*=\s*(?:[\w$]+\s*\.\s*)*)?(?:getElementById\(\s*(['"`])([^'"`]+)\2|querySelector\(\s*(['"`])#([\w-]+)[^'"`]*\4)\s*\)\s*(\?\.|\?\?|\|\||&&|[.[])?/g;
/**
 * Ids a page or a script defines, each with the id as group 2: `id="x"` (group 3: what ends
 * the value), `<p id=x>`, `.id = 'x'`, `setAttribute('id', 'x')`, `{ id: 'x' }`.
 */
const DEFINITIONS = [
  /(?<![\w$.-])id\s*=\s*\\?(['"`])([^'"`\s>\\]+)\\?(['"`])?/gi,
  /(?<=<\w[^<>]*\s)id\s*=\s*()([\w-]+)/gi,
  /\.id\s*=\s*(['"`])([^'"`]+)\1/g,
  /setAttribute\(\s*['"`]id['"`]\s*,\s*(['"`])([^'"`]+)\1/g,
  /(?<![\w$.-])id['"]?\s*:\s*(['"`])([^'"`]+)\1/g,
];
/** An id a script sets from something other than one string: `.id = name`, `.id = 'a' + i`. */
const COMPUTED_ID =
  /(?:\.id\s*=(?!=)|setAttribute\(\s*['"`]id['"`]\s*,)\s*(?:(?!['"`])\S|(['"`])[^'"`]*\1\s*\+)/;
/** Compiles a script without running it; `await` is allowed at the top. */
const AsyncFunction = Object.getPrototypeOf(async () => undefined)
  .constructor as new (code: string) => unknown;

/**
 * A check of CopilotKit's `generateSandboxedUi` calls: every script must parse, and every element
 * a script looks up by id and uses must be in the page. Small models often write a script for a
 * page other than the one they wrote; the page then shows, but its script fails in the sandbox
 * where the model never hears of it. With this check the model is asked to fix the call first.
 *
 * It reads the scripts with patterns, not a parser, and only names what would throw: a lookup
 * used at once (`getElementById('x').value`) or kept in a variable the script never tests
 * (`if (el)`, `el?.`, `el &&`). Comments are skipped. Ids count however they are written:
 * `id="x"` in any case, `el.id = 'x'`, `setAttribute('id', 'x')`, `{ id: 'x' }`. When a script
 * builds an id at run time (`el.id = name`, `` id="row-${i}" ``) the elements are not checked.
 *
 * ```ts
 * new ToolCalling({ checks: [new SandboxedUiCheck()] });
 * ```
 */
export class SandboxedUiCheck implements ToolCheck {
  readonly tool = 'generateSandboxedUi';

  check(args: Readonly<Record<string, unknown>>): string | undefined {
    const html = asString(args['html']) ?? '';
    const expressions = (asArray(args['jsExpressions']) ?? []).map(String);
    const scripts = [asString(args['jsFunctions']) ?? '', ...expressions];
    return (
      SandboxedUiCheck.#syntax(scripts) ??
      SandboxedUiCheck.#elements(html, scripts.join('\n'))
    );
  }

  static #syntax(scripts: readonly string[]): string | undefined {
    for (const script of scripts) {
      if (!script.trim()) continue;
      try {
        new AsyncFunction(script);
      } catch (error) {
        // A page whose content policy forbids compiling code cannot check it: no error then.
        if (!(error instanceof SyntaxError)) return undefined;
        return `the script does not parse (${error.message}); send valid JavaScript`;
      }
    }
    return undefined;
  }

  static #elements(html: string, scripts: string): string | undefined {
    const script = scripts.replace(STRING_OR_COMMENT, (found) =>
      found.startsWith('/') ? ' ' : found,
    );
    // An id the script builds at run time cannot be checked.
    if (COMPUTED_ID.test(script)) return undefined;
    const defined = SandboxedUiCheck.#defined(`${html}\n${script}`);
    const wanted = SandboxedUiCheck.#wanted(script);
    if (!defined || [...wanted].some((id) => id.includes('${')))
      return undefined;
    const missing = [...wanted].filter((id) => !defined.has(id));
    if (missing.length === 0) return undefined;
    const have = [...defined].map((id) => `#${id}`).join(', ') || 'none';
    return `the script uses elements the html does not have: ${missing.map((id) => `#${id}`).join(', ')}; add them to the html or use the ids it has (${have})`;
  }

  /** The ids the page and the script define; undefined when one is built at run time. */
  static #defined(text: string): Set<string> | undefined {
    const ids = new Set<string>();
    for (const pattern of DEFINITIONS) {
      for (const [, open, id = '', close] of text.matchAll(pattern)) {
        // `id="row-${i}"`, or `'<p id="row-' + i` where another quote ends the value.
        if (id.includes('${') || (close && close !== open)) return undefined;
        ids.add(id);
      }
    }
    return ids;
  }

  /** The ids of the lookups that throw when the element is missing. */
  static #wanted(script: string): Set<string> {
    const ids = new Set<string>();
    for (const match of script.matchAll(LOOKUP)) {
      const [, variable, , byId, , bySelector, use] = match;
      const used = use
        ? use === '.' || use === '['
        : variable !== undefined && !SandboxedUiCheck.#tested(variable, script);
      if (used) ids.add(byId ?? bySelector ?? '');
    }
    return ids;
  }

  /** Whether the script tests `variable` somewhere: `if (el)`, `!el`, `el?.`, `el &&`, `el == null`. */
  static #tested(variable: string, script: string): boolean {
    const name = `(?<![\\w$.])${variable.replaceAll('$', '\\$')}(?![\\w$])`;
    return new RegExp(
      `(?:\\b(?:if|while)\\s*\\(|[!&|])\\s*${name}(?!\\s*[.[(])|${name}\\s*(?:\\?|&&|\\|\\||[!=]==?)`,
    ).test(script);
  }
}
