const js = require('@eslint/js');
const globals = require('globals');
const security = require('eslint-plugin-security');
const react = require('eslint-plugin-react');

module.exports = [
  {
    ignores: ['**/node_modules/**', '**/coverage/**', '**/dist/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 2023,
      sourceType: 'commonjs',
    },
    plugins: { security },
    rules: security.configs.recommended.rules,
  },
  {
    files: ['db/**/*.js'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['frontend/**/*.{js,jsx}'],
    ...react.configs.flat.recommended,
    ...react.configs.flat['jsx-runtime'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: '18.3' } },
  },
];
