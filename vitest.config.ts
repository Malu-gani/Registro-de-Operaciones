import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "sql",
          include: ["tests/sql/**/*.test.ts"],
          environment: "node",
          // Consulta la config de Supabase local una sola vez, antes de los
          // workers: la CLI no tolera varias instancias en paralelo (ver el
          // archivo).
          globalSetup: ["tests/setup/globalSetup.ts"],
          // Las RPC van y vuelven por HTTP contra Docker: más lentas que un test puro.
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
