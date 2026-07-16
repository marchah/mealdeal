import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.d.ts',
      'packages/contract/**',
      'packages/api/drizzle/**',
      '**/*.config.{js,ts,mjs}',
      '**/scripts/**',
      'eslint.config.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // high-value async-safety rules — kept as errors (good practice)
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // silence the unsafe-* family that fights typed GraphQL/ORM builders
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      // Environment variables are read ONLY in common/settings.ts (single source of truth).
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read environment variables only in common/settings.ts.',
        },
      ],
      // Use the logger (common/logger.ts), never console.*.
      'no-console': 'error',
    },
  },

  // ---- The hard dependency rule, machine-enforced (resolver → service → repository → db) ----
  {
    files: ['packages/api/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // Resolve extensionless TS imports so the rule can classify each import's target.
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: 'packages/api/tsconfig.json' },
      },
      'boundaries/include': ['packages/api/src/**/*'],
      // File-level classification (each layer is a file inside a module folder).
      'boundaries/files': [
        { category: 'resolver', pattern: 'packages/api/src/modules/*/schema.pothos.ts' },
        { category: 'service', pattern: 'packages/api/src/modules/*/service.ts' },
        { category: 'repository', pattern: 'packages/api/src/modules/*/repository.ts' },
        { category: 'db', pattern: 'packages/api/src/db/**/*.ts' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { file: { categories: 'resolver' } },
              disallow: { to: { file: { categories: { anyOf: ['db', 'repository'] } } } },
              message:
                'Layer violation: resolvers must reach data via ctx.services — never import db or repository.',
            },
            {
              from: { file: { categories: 'service' } },
              disallow: { to: { file: { categories: { anyOf: ['db', 'resolver'] } } } },
              message:
                'Layer violation: services depend on repository PORT TYPES — never the db or a resolver.',
            },
            {
              from: { file: { categories: 'repository' } },
              disallow: { to: { file: { categories: { anyOf: ['resolver', 'service'] } } } },
              message:
                'Layer violation: repositories are the data layer — never import a service or resolver.',
            },
          ],
        },
      ],
    },
  },

  // ---- Web (React SPA) ----
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // ---- Node globals for the backend ----
  {
    files: ['packages/api/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
