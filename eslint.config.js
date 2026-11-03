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
    // Privileged-client boundary: the service-role Supabase client, the
    // Bachs payments client and webhook handler, the shared Meta AI transport
    // (it reads MODEL_API_KEY), and the admin guard built on them may only be
    // imported by server-only modules and the server-function bridge modules
    // below. UI routes and components must go through server functions instead.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/**/*.server.{ts,tsx}",
      "src/integrations/supabase/**",
      "src/showcase/admin/admin-functions.ts",
      "src/showcase/admin/intelligence-functions.ts",
      "src/showcase/promotions/promotion-functions.ts",
      "src/showcase/copilot/generateSuggestions.ts",
      "src/showcase/discovery/interpretDiscoveryQuery.ts",
      "src/showcase/scout/scout-functions.ts",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: [
              "**/client.server",
              "**/require-permission.server",
              "**/bachs-webhook.server",
              "**/promotion-checkout.server",
              "**/promotion-orders.server",
            ],
            message:
              "Privileged server clients (Supabase service-role, Bachs) are server-only. Import them only from *.server.ts modules; UI code must call a server function instead.",
          },
        ],
      }],
    },
  },
);
