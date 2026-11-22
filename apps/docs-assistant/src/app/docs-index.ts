/** A part of a docs page: the text under one heading. */
export interface DocsSection {
  /** Stable id: the page path and the heading's anchor. */
  readonly id: string;
  /** Title of the page. */
  readonly page: string;
  /** The heading of the section; the page title for the text before the first heading. */
  readonly title: string;
  /** Path on the docs site, with the heading's anchor. */
  readonly url: string;
  readonly text: string;
}

/** A section that matches a search, with the text around the first match. */
export interface DocsHit {
  readonly id: string;
  readonly page: string;
  readonly title: string;
  readonly url: string;
  readonly excerpt: string;
}

/** Words too common to tell sections apart. */
const STOP_WORDS = new Set(
  'a an and are as at be by can do does for from how i in is it of on or the this to what when where which with you your'.split(
    ' ',
  ),
);
const EXCERPT_LENGTH = 280;

/**
 * The docs, split into sections and searchable by keywords. Built from the Markdown files of
 * the docs site, in the browser: no server, no search service.
 */
export class DocsIndex {
  readonly sections: readonly DocsSection[];
  /** In how many sections each word appears, to weigh rare words higher. */
  readonly #documentFrequency = new Map<string, number>();

  constructor(sections: readonly DocsSection[]) {
    this.sections = sections;
    for (const section of sections) {
      for (const word of new Set(words(`${section.title} ${section.text}`)))
        this.#documentFrequency.set(
          word,
          (this.#documentFrequency.get(word) ?? 0) + 1,
        );
    }
  }

  /**
   * Builds the index from Markdown files by path, as `import.meta.glob` returns them. Paths are
   * relative to the docs folder after `docs/`, for example `…/docs/engines/index.md`.
   */
  static fromFiles(files: Readonly<Record<string, string>>): DocsIndex {
    return new DocsIndex(
      Object.entries(files).flatMap(([path, markdown]) =>
        splitPage(pagePath(path), markdown),
      ),
    );
  }

  /** The best sections for `query`, best first. */
  search(query: string, limit = 5): DocsHit[] {
    const terms = [...new Set(words(query))];
    if (terms.length === 0) return [];
    return this.sections
      .map((section) => ({ section, score: this.#score(section, terms) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ section }) => ({
        id: section.id,
        page: section.page,
        title: section.title,
        url: section.url,
        excerpt: excerpt(section.text, terms),
      }));
  }

  /** A section by id. */
  section(id: string): DocsSection | undefined {
    return this.sections.find((section) => section.id === id);
  }

  #score(section: DocsSection, terms: readonly string[]): number {
    const title = words(section.title);
    const page = words(section.page);
    const text = words(section.text);
    let score = 0;
    for (const term of terms) {
      const inText = text.filter((word) => word === term).length;
      const inTitle = title.filter((word) => word === term).length;
      const inPage = page.filter((word) => word === term).length;
      if (inText + inTitle + inPage === 0) continue;
      const rarity = Math.log(
        1 + this.sections.length / (this.#documentFrequency.get(term) ?? 1),
      );
      score += (3 * inTitle + 2 * inPage + Math.log(1 + inText)) * rarity;
    }
    return score;
  }
}

/** `…/docs/docs/engines/index.md` → `engines/index`. */
function pagePath(path: string): string {
  return path.replace(/^.*?\/docs\/docs\//, '').replace(/\.mdx?$/, '');
}

/** Splits one Markdown page at its `##` and `###` headings, outside code blocks. */
function splitPage(path: string, markdown: string): DocsSection[] {
  const { body, title: frontmatterTitle, slug } = frontmatter(markdown);
  const pageUrl =
    `/docs${slug ?? `/${path.replace(/(^|\/)index$/, '')}`}`.replace(/\/$/, '');
  const page = frontmatterTitle ?? /^# (.+)$/m.exec(body)?.[1]?.trim() ?? path;
  const sections: DocsSection[] = [];
  let title = page;
  let anchor = '';
  let lines: string[] = [];
  /** The code block the line is in: its fence and language. */
  let fence: { readonly marker: string; readonly language: string } | undefined;

  const flush = () => {
    const text = lines.join('\n').trim();
    if (text)
      sections.push({
        id: `${path}#${anchor}`,
        page,
        title,
        url: anchor ? `${pageUrl || '/docs'}#${anchor}` : pageUrl || '/docs',
        text,
      });
    lines = [];
  };

  for (const line of body.split('\n')) {
    const marker = /^(`{3,}|~{3,})\s*(\S*)/.exec(line);
    if (fence) {
      const closes = marker?.[1] === fence.marker && !marker[2];
      // Diagrams are drawings, not text to search.
      if (fence.language !== 'mermaid') lines.push(line);
      if (closes) fence = undefined;
      continue;
    }
    if (marker) {
      fence = { marker: marker[1] ?? '```', language: marker[2] ?? '' };
      if (fence.language !== 'mermaid') lines.push(line);
      continue;
    }
    const heading = /^#{2,3} (.+)$/.exec(line);
    if (heading?.[1]) {
      flush();
      title = heading[1].replace(/`/g, '').trim();
      anchor = slugify(title);
      continue;
    }
    // The page title is in `page` already.
    if (!line.startsWith('# ')) lines.push(line);
  }
  flush();
  return sections;
}

/** The front matter fields this index uses, and the page without it. */
function frontmatter(markdown: string): {
  body: string;
  title?: string;
  slug?: string;
} {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  if (!match) return { body: markdown };
  const field = (name: string) =>
    new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(match[1] ?? '')?.[1]?.trim();
  const title = field('title');
  const slug = field('slug');
  return {
    body: markdown.slice(match[0].length),
    ...(title ? { title } : {}),
    ...(slug ? { slug } : {}),
  };
}

/** Docusaurus' heading anchor: lower case, punctuation removed, spaces as hyphens. */
function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter(
    (word) => word.length > 1 && !STOP_WORDS.has(word),
  );
}

/** The text around the first match, on one line, without code fences and table syntax. */
function excerpt(text: string, terms: readonly string[]): string {
  const flat = text
    .split('\n')
    // Code fences and table separator rows say nothing.
    .filter((line) => !/^(`{3,}|~{3,})|^\|?[\s:|-]+\|?$/.test(line))
    // A table row reads as its cells.
    .map((line) =>
      line.startsWith('|')
        ? line
            .split('|')
            .map((cell) => cell.trim())
            .filter(Boolean)
            .join(' · ')
        : line,
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lower = flat.toLowerCase();
  const first = Math.min(
    ...terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0),
    flat.length,
  );
  const start = Math.max(0, first - 60);
  const end = start + EXCERPT_LENGTH;
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}
