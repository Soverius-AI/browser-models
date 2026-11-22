import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/.docusaurus',
      'apps/docs/static/examples',
      '**/vitest.config.*.timestamp*',
      '**/vite.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          // DDD boundaries: domains (scope:*) and layers (type:*).
          depConstraints: [
            // Domains
            {
              sourceTag: 'scope:agent',
              onlyDependOnLibsWithTags: ['scope:agent'],
            },
            {
              sourceTag: 'scope:frameworks',
              onlyDependOnLibsWithTags: ['scope:agent'],
            },
            { sourceTag: 'scope:examples', onlyDependOnLibsWithTags: ['*'] },
            // Layers: engines (core) ← AG-UI agent ← tool calling; frameworks build on the agent.
            { sourceTag: 'type:core', onlyDependOnLibsWithTags: [] },
            {
              sourceTag: 'type:agent',
              onlyDependOnLibsWithTags: ['type:core'],
            },
            {
              sourceTag: 'type:tools',
              onlyDependOnLibsWithTags: ['type:core', 'type:agent'],
            },
            {
              sourceTag: 'type:framework',
              onlyDependOnLibsWithTags: ['type:core', 'type:agent'],
            },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: [
                'type:core',
                'type:agent',
                'type:tools',
              ],
            },
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['*'] },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
