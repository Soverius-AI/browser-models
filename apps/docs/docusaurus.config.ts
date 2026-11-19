import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const site = 'https://soverius.ai';
const github = 'https://github.com/Soverius-AI/browser-models';

const prismTheme = {
  plain: {
    color: 'var(--color-base-content)',
    backgroundColor: 'var(--color-base-200)',
  },
  styles: [
    {
      types: ['comment', 'prolog', 'doctype', 'cdata'],
      style: { color: 'var(--ifm-font-color-secondary)' },
    },
    {
      types: ['keyword', 'tag', 'selector'],
      style: { color: 'var(--color-primary)' },
    },
    {
      types: ['function', 'class-name', 'builtin'],
      style: { color: 'var(--color-accent)' },
    },
    {
      types: ['string', 'char', 'attr-value', 'regex'],
      style: {
        color:
          'color-mix(in oklch, var(--color-success), var(--color-base-content) 25%)',
      },
    },
    {
      types: ['number', 'boolean', 'constant'],
      style: {
        color:
          'color-mix(in oklch, var(--color-secondary), var(--color-base-content) 25%)',
      },
    },
  ],
};

const config: Config = {
  title: 'browser-models by Soverius AI',
  tagline: 'One API to rule them all',
  // Public origin for canonical links and the sitemap; set at build time (see Dockerfile).
  url: process.env['SITE_URL'] ?? 'https://browser-models.soverius.ai',
  baseUrl: '/',
  favicon: 'img/browser-models-mark.svg',
  onBrokenLinks: 'throw',
  markdown: { mermaid: true },
  themes: ['@docusaurus/theme-mermaid'],
  stylesheets: [
    'https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;700;800&family=Inter:wght@400;500;600&display=swap',
  ],
  presets: [
    [
      'classic',
      {
        docs: { routeBasePath: '/docs', sidebarPath: './sidebars.ts' },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    prism: { theme: prismTheme, darkTheme: prismTheme },
    navbar: {
      logo: {
        alt: 'browser models',
        src: 'img/browser-models-wordmark.svg',
        srcDark: 'img/browser-models-wordmark-dark.svg',
      },
      items: [
        { to: '/docs', label: 'Docs', position: 'left' },
        { to: '/playground', label: 'Playground', position: 'left' },
        { href: `${site}/newsletter`, label: 'Newsletter', position: 'right' },
        { href: site, label: 'soverius.ai', position: 'right' },
        { href: github, label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'light',
      logo: {
        alt: 'Soverius AI',
        src: 'img/soverius-logo.svg',
        href: site,
        height: 32,
      },
      links: [
        {
          title: 'browser-models',
          items: [
            { label: 'Docs', to: '/docs' },
            { label: 'Playground', to: '/playground' },
            { label: 'GitHub', href: github },
          ],
        },
        {
          title: 'Soverius AI',
          items: [
            { label: 'Workshops', href: `${site}/courses` },
            { label: 'Services', href: `${site}/services` },
            { label: 'Blog', href: `${site}/blog` },
            { label: 'Contact', href: `${site}/contact` },
          ],
        },
        {
          title: 'Stay in the loop',
          items: [
            { label: 'Newsletter', href: `${site}/newsletter` },
            {
              label: 'Quantized AI News',
              href: `${site}/blog/topic/quanitzed-ai-news`,
            },
            { label: 'Free ebook', href: `${site}/ebook` },
            { label: 'Talks', href: `${site}/talks` },
          ],
        },
        {
          title: 'Legal',
          items: [
            { label: 'Impressum', href: `${site}/legal/impressum` },
            { label: 'Privacy', href: `${site}/legal/privacy` },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Soverius AI · MIT licensed`,
    },
    colorMode: { defaultMode: 'dark', respectPrefersColorScheme: false },
  } satisfies Preset.ThemeConfig,
};

export default config;
