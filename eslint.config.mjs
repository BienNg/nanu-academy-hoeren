import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Allow `const { omitted: _omitted, ...rest } = obj` to drop keys.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { ignoreRestSiblings: true, varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Compiled test output and vendored design prototypes.
    ".test-dist/**",
    "design-reference/**",
  ]),
]);

export default eslintConfig;
