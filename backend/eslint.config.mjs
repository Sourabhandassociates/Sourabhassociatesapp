// .mjs regardless of the package's own CommonJS module type — ESLint's flat-config
// loader honors the file extension over package.json's "type", which sidesteps any
// ESM/CJS friction with tooling (typescript-eslint, @eslint/js) that ships as ESM.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "uploads/**", "uploads-test/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Deliberate stdout output for CLI scripts and the startup banner — not stray
    // debug logging in application/business logic, which is what no-console guards.
    files: ["src/scripts/**/*.ts", "src/server.ts"],
    rules: { "no-console": "off" },
  },
  eslintConfigPrettier
);
