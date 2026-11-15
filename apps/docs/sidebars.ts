import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'architecture',
    'agent',
    'engines',
    'tools',
    'generative-ui',
    'models',
    {
      type: 'category',
      label: 'Frameworks',
      items: ['vanilla', 'angular', 'react', 'vue'],
    },
  ],
};

export default sidebars;
