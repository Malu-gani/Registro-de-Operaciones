import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefactos generados por la CLI de Supabase (`npx supabase start`). No es
    // código del proyecto y ya está en supabase/.gitignore; ESLint no lee el
    // .gitignore en flat config, así que hay que ignorarlo acá también.
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
