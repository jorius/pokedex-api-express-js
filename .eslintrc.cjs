module.exports = {
  root: true,
  env: {
    node: true,
    es2024: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'airbnb-base',
    'plugin:import/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2024,
    sourceType: 'module',
  },
  rules: {
    // Jericho formatting standard: max line length 180 (airbnb defaults to 100)
    'max-len': ['error', { code: 180 }],
    eqeqeq: ['error', 'always'],
    'prefer-const': 'error',
    'no-var': 'error',
    // Allow `void someAsyncCall();` as a statement — marks a deliberately-unawaited promise (e.g. fire-and-forget shutdown handlers).
    'no-void': ['error', { allowAsStatement: true }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$' }],
    'no-shadow': 'warn',
    'no-console': 'warn',
    'import/no-cycle': 'error',
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', ['parent', 'sibling'], 'index'],
        // 'ignore' instead of 'always': labeled import groups (// packages, // utils, ...)
        // require one blank line between groups, which 'always' rejects inside relative imports.
        'newlines-between': 'ignore',
      },
    ],
    // ESM requires explicit file extensions on relative imports
    'import/extensions': ['error', 'ignorePackages'],
    'import/prefer-default-export': 'off',
  },
};
