import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "docs/", "icons/"] },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, chrome: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs", "eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      // Browser globals cover code inside Playwright page.evaluate callbacks,
      // which also has access to the chrome extension APIs.
      globals: { ...globals.node, ...globals.browser, chrome: "readonly" },
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      // Asserting on vi.fn() members (expect(api.removeTabs)...) trips this
      // rule, but Vitest matchers never rebind `this`.
      "@typescript-eslint/unbound-method": "off",
    },
  },
  prettier,
);
