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
      // File-level classification (each layer is a file inside an entity/module folder).
      // Every file under src/ must match one of these (see no-unknown-files below). Order matters:
      // the FIRST matching pattern classifies the file, so tests come first (a *.spec.ts is never
      // mistaken for the layer it sits beside).
      'boundaries/files': [
        { category: 'test', pattern: 'packages/api/src/**/*.spec.ts' },
        { category: 'resolver', pattern: 'packages/api/src/{entities,features}/*/graphql/**/*.ts' },
        { category: 'service', pattern: 'packages/api/src/{entities,features}/*/service.ts' },
        { category: 'repository', pattern: 'packages/api/src/{entities,features}/*/repository.ts' },
        { category: 'types', pattern: 'packages/api/src/{entities,features}/*/types.ts' },
        { category: 'adapter', pattern: 'packages/api/src/third-party/*/**/*.ts' },
        { category: 'db', pattern: 'packages/api/src/db/**/*.ts' },
        { category: 'ingest', pattern: 'packages/api/src/ingest/*.ts' },
        { category: 'common', pattern: 'packages/api/src/common/*.ts' },
        // Package composition roots (each folder's index.ts) + the top-level backbone files.
        {
          category: 'backbone',
          pattern: 'packages/api/src/{entities,features,third-party}/index.ts',
        },
        { category: 'backbone', pattern: 'packages/api/src/*.ts' },
      ],
    },
    rules: {
      // No file under packages/api/src may escape classification (see boundaries/files) — this is
      // what stops a feature being dropped at src/<name>/ instead of an entities/ or features/ folder.
      'boundaries/no-unknown-files': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { file: { categories: 'resolver' } },
              disallow: {
                to: { file: { categories: { anyOf: ['db', 'repository', 'adapter'] } } },
              },
              message:
                'Layer violation: resolvers must reach data via ctx.services — never import db, a repository, or an adapter.',
            },
            {
              from: { file: { categories: 'service' } },
              disallow: { to: { file: { categories: { anyOf: ['db', 'resolver', 'adapter'] } } } },
              message:
                'Layer violation: services depend on repository/adapter PORT TYPES — never the db, a resolver, or a concrete adapter.',
            },
            {
              from: { file: { categories: 'repository' } },
              disallow: {
                to: { file: { categories: { anyOf: ['resolver', 'service', 'adapter'] } } },
              },
              message:
                'Layer violation: repositories are the data layer — never import a service, resolver, or adapter.',
            },
            {
              from: { file: { categories: 'adapter' } },
              disallow: {
                to: {
                  file: { categories: { anyOf: ['db', 'repository', 'service', 'resolver'] } },
                },
              },
              message:
                'Layer violation: third-party adapters own only transport — never import db, a repository, a service, or a resolver. Implement the port declared in the slice that owns the port.',
            },
          ],
        },
      ],
    },
  },

  // ---- Provider/HTTP clients belong in third-party/, never inside a module ----
  {
    files: ['packages/api/src/{entities,features}/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['axios', 'node-fetch', 'undici', 'got'].map((name) => ({
            name,
            message:
              'HTTP/provider clients belong in third-party/<provider>/ behind a port — not in a slice.',
          })),
          patterns: [
            {
              group: ['node:http', 'node:https'],
              message:
                'Raw HTTP belongs in third-party/<provider>/ behind a port — not in a slice.',
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
