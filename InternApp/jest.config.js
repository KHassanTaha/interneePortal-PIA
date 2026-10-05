/**
 * Jest configuration.
 *
 * The RN preset ships a default `transformIgnorePatterns` that only
 * transforms `react-native`, `jest-react-native` and `@react-native*`.
 * Every other package in `node_modules` is left untransformed, so any
 * dependency published as ESM-only fails at require time with
 * "Cannot use import statement outside a module".
 *
 * `App.js` pulls in react-redux, redux-persist and @reduxjs/toolkit, so
 * they must be allow-listed here or the suite cannot even load.
 * AGENTS.md 11.2 forbids TypeScript tooling, hence a plain JS config.
 */

const ESM_PACKAGES = [
  '(jest-)?react-native',
  '@react-native(-community)?',
  '@react-navigation',
  'react-redux',
  'redux',
  'redux-persist',
  '@reduxjs/toolkit',
  'immer',
  'reselect',
  'react-native-.*',
];

module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [`node_modules/(?!(${ESM_PACKAGES.join('|')})/)`],
  setupFiles: ['<rootDir>/jest.setup.js'],
};