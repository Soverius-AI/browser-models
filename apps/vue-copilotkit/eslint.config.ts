import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import baseConfig from '../../eslint.config.ts';

export default [
  ...baseConfig,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: await import('@typescript-eslint/parser'),
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  // Prettier formats the templates; turn off the Vue rules that disagree with it.
  prettier,
];
