import { CopilotChatAssistantMessage } from '@copilotkit/react-core/v2';
import type { ComponentProps } from 'react';
import { docs } from './agent';
import type { DocsIndex } from './docs-index';
import { openDocsPage } from './docs-tools';

/** A docs page the model wrote as `[/docs/…]`, without `(url)`. */
const BARE_PAGE = /\[(\/docs\/[^\]\s]*)\](?!\()/g;
/** A docs path in plain text, such as "at /docs/examples.": not in a link or a URL. */
const PLAIN_PAGE = /(?<![[(\w/])(\/docs(?:\/[\w./#-]*[\w/])?)(?![\w\]/])/g;
/** Code in Markdown: fenced blocks and inline spans, left as they are. */
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;
/** Inline code that is only a docs path, such as `/docs/examples`. */
const CODE_PAGE = /^`(\/docs(?:[/#][^`\s]*)?)`$/;
/** Hosts a small model invents for these docs, such as browser-models.readthedocs.io. */
const INVENTED_DOCS = /browser-models|soverius|readthedocs|gitbook/i;
/** Path parts of invented docs sites that are not part of a page's path. */
const NOT_A_PAGE = /^(docs|en|latest|stable|v?\d[\w.]*|index(\.html?)?)$/i;
const SITE = 'https://browser-models.soverius.ai';

/** Where a link of the model goes. */
export type DocsLinkTarget =
  | { readonly kind: 'docs'; readonly url: string }
  | { readonly kind: 'external'; readonly url: string }
  /** An invented docs page with no page here: shown as text. */
  | { readonly kind: 'none' };

/**
 * Links in the model's answers. Small models leave out the `(url)` of a docs link, or invent a
 * docs site; the links go to the pages of these docs instead.
 */
export class DocsLinks {
  /** The page urls of these docs, without anchors, such as `/docs/examples`. */
  readonly #pages: ReadonlySet<string>;

  constructor(pages: Iterable<string>) {
    this.#pages = new Set(pages);
  }

  static fromIndex(index: DocsIndex): DocsLinks {
    return new DocsLinks(
      index.sections.map(({ url }) => url.replace(/#.*$/, '')),
    );
  }

  /** Makes `[/docs/…]`, a plain /docs/… and code that is only a docs path links to that page. */
  static complete(markdown: string): string {
    // split() with a group keeps the code: odd parts are code.
    return markdown
      .split(CODE)
      .map((part, index) =>
        index % 2
          ? part.replace(CODE_PAGE, '[$1]($1)')
          : part.replace(BARE_PAGE, '[$1]($1)').replace(PLAIN_PAGE, '[$1]($1)'),
      )
      .join('');
  }

  resolve(href: string): DocsLinkTarget {
    let url: URL;
    try {
      url = new URL(href, SITE);
    } catch {
      return { kind: 'none' };
    }
    const ours = url.origin === SITE;
    if (!ours && !INVENTED_DOCS.test(url.hostname))
      return { kind: 'external', url: url.href };
    const page = this.#page(url.pathname);
    if (page) return { kind: 'docs', url: page + url.hash };
    return { kind: 'none' };
  }

  /** The page of these docs a path means: itself, or the page its last parts name. */
  #page(pathname: string): string | undefined {
    const path = pathname.replace(/\/+$/, '') || '/docs';
    if (this.#pages.has(path)) return path;
    const parts = path
      .split('/')
      .filter((part) => part && !NOT_A_PAGE.test(part));
    for (let start = 0; start < parts.length; start++) {
      const candidate = `/docs/${parts.slice(start).join('/')}`;
      if (this.#pages.has(candidate)) return candidate;
    }
    return undefined;
  }
}

const links = DocsLinks.fromIndex(docs);

type MarkdownProps = ComponentProps<
  typeof CopilotChatAssistantMessage.MarkdownRenderer
>;

/** CopilotKit's answer markdown, with links that go to pages of these docs. */
export function DocsMarkdown({ content, components, ...props }: MarkdownProps) {
  return (
    <CopilotChatAssistantMessage.MarkdownRenderer
      {...props}
      content={DocsLinks.complete(content)}
      components={{ ...components, a: DocsLink }}
    />
  );
}

/** A docs page opens in the docs site, like the page card; other links in a new tab. */
function DocsLink({ href = '', children }: ComponentProps<'a'>) {
  const target = links.resolve(href);
  if (target.kind === 'none') return <span>{children}</span>;
  if (target.kind === 'external')
    return (
      <a href={target.url} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  return (
    <a
      href={target.url}
      className="link link-primary"
      onClick={(event) => {
        event.preventDefault();
        openDocsPage(target.url);
      }}
    >
      {children}
    </a>
  );
}
