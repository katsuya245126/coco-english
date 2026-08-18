import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "node_modules/**",
      "coverage/**",
      "supabase/.temp/**",
      "test-results/**",
      "playwright-report/**",
      // Sandbox/agent worktrees are gitignored, generated checkouts; never lint
      // their generated next-env.d.ts and build output.
      ".claude/**",
      ".worktrees/**",
      // Agent tooling scratch output, not project code.
      ".ua/**",
      // Vendored agent skill assets, not project code.
      ".agents/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Anti-slop: double assertions (`x as unknown as Y`) silence the type
      // checker entirely; fix the types or validate with zod instead.
      // ponytail: src/ is clean of both, so these stay error; tests below
      // remain exempt.
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > TSAsExpression",
          message:
            "Chained type assertion defeats type checking. Fix the types or parse with zod.",
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Tests stub and coerce freely; `!` and double assertions are idiomatic there.
    files: ["tests/**", "**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"],
    rules: {
      "no-restricted-syntax": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];

export default eslintConfig;
