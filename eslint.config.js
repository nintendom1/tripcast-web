import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      // Convex codegen — third-party output.
      "src/convex/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      // Register the namespace so existing `eslint-disable-next-line
      // @typescript-eslint/...` comments resolve without enabling any of
      // the rules. We don't want to flip the codebase into a full TS-lint
      // policy as part of this change.
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Catches conditional hooks: hooks called after early returns, inside
      // conditionals, or inside loops. This is what would have flagged the
      // App.tsx ConnectedApp follower-tour effect bug at commit 704fcb8 before
      // it shipped.
      "react-hooks/rules-of-hooks": "error",
      // Surface stale-closure footguns as warnings, not errors. The codebase
      // has a handful of intentional `eslint-disable-next-line` suppressions
      // around this rule already (one-shot effects keyed on a specific id),
      // so warning is the right severity.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
