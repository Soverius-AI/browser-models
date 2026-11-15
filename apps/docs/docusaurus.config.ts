import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const site = 'https://soverius.ai';
const github = 'https://github.com/Soverius-AI/browser-models';

const config: Config = {
  title: 'browser-models by Soverius AI',
  tagline: 'Browser models as AG-UI agents',
  // Public origin for canonical links and the sitemap; set at build time (see Dockerfile).
  url: process.env['SITE_URL'] ?? 'https://browser-models.soverius.ai',
  baseUrl: '/',
  favicon: 'img/favicon.svg',
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
    navbar: {
      title: 'browser-models',
      logo: {
        alt: 'Soverius AI',
        src: 'img/soverius-logo.svg',
        srcDark: 'img/soverius-logo-dark.svg',
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
      style: 'dark',
      logo: {
        alt: 'Soverius AI',
        src: 'img/soverius-logo-dark.svg',
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
    colorMode: { respectPrefersColorScheme: true },
  } satisfies Preset.ThemeConfig,
};

export default config;
