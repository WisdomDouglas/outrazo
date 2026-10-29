import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".nitro", ".tanstack", ".wrangler", "src/routeTree.gen.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Privileged-client boundary: the service-role Supabase client (and the
    // admin guard built on it) may only be imported by server-only modules
    // and the one server-function bridge module below. UI routes and
    // components must go through server functions instead.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/**/*.server.{ts,tsx}",
      "src/integrations/supabase/**",
      "src/showcase/admin/admin-functions.ts",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["**/client.server", "**/require-permission.server"],
            message:
              "The Supabase service-role client is server-only. Import it only from *.server.ts modules; UI code must call a server function instead.",
          },
        ],
      }],
    },
  },
);
