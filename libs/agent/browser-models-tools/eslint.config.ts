import baseConfig from '../../../eslint.config.ts';

export default [
  ...baseConfig,
  {
    // The specs also run tool calling inside the AG-UI agent, one layer up.
    files: ['src/**/*.spec.ts'],
    rules: { '@nx/enforce-module-boundaries': 'off' },
  },
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
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
