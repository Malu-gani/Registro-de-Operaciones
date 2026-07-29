import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Los tests de SQL y E2E tienen su propio comando: `npm test` no los corre.
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
