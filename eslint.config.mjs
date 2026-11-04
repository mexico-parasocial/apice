// ESLint for the API, the mobile app and the lexicons package.
// The admin panel lints with `next lint` (apps/admin/.eslintrc.json).
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/build/**",
      "**/dist/**",
      "**/.expo/**",
      "**/.next/**",
      "apps/admin/**",
      "apps/api/prisma/migrations/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase predates the linter: these are tracked debt, surfaced
      // as warnings so new code can't make them worse unnoticed.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["apps/api/**/*.ts", "packages/**/*.js", "**/*.config.{js,mjs,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["apps/mobile/**/*.{ts,tsx,js}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node, __DEV__: "readonly" } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  }
);
