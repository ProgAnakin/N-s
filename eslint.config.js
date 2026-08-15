import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Lint rules for "Nós".
 *
 * The project ran on `tsc --noEmit` alone for its whole life, which catches
 * types and nothing else. Everything below is here because it catches a
 * class of bug this codebase has actually shipped at least once:
 *
 *   - `react-hooks/exhaustive-deps` — a stale closure in an effect is how
 *     the FX repair loop first went wrong.
 *   - `no-floating-promises` — almost every mutation here is fired and
 *     forgotten, which is the right shape for the interface and the reason
 *     `write-status.ts` exists. A promise nobody voided is one nobody
 *     decided about.
 *   - `no-misused-promises` — an async function passed straight to onClick
 *     swallows its own rejection.
 *
 * Type-aware rules need the TypeScript program, so the config is split:
 * source files get the full treatment, config files at the root get the
 * plain recommended set.
 */
export default tseslint.config(
  { ignores: ['dist', 'coverage', '.claude/skills', 'node_modules'] },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Unused code is dead code. `_`-prefixed args are the escape hatch,
      // used where a signature is fixed by a library.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // The two that matter most in an app of fire-and-forget writes.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],

      // The test harness and the Supabase client legitimately deal in
      // `any` at their boundaries; inside a component it is a mistake.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // Template literals carrying a number or a boolean are ordinary here.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },

  // Tests reach into fakes and assert on shapes the app never sees.
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'react-refresh/only-export-components': 'off',
      // `vi.fn(async () => ({ … }))` is the idiomatic shape for a mocked
      // async boundary, and it has nothing to await by definition.
      '@typescript-eslint/require-await': 'off',
    },
  },

  {
    files: ['*.{js,cjs,mjs}', 'scripts/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
);
