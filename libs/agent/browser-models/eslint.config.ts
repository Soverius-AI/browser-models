import baseConfig from '../../../eslint.config.ts';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          // Referenced by a triple-slash directive retained in published declarations.
          ignoredDependencies: ['@types/dom-chromium-ai'],
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
            // Test-only code for the specs; not part of the build.
            '{projectRoot}/src/testing/**',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
