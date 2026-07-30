import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * Consulta Supabase local para saber contra qué URL y con qué clave levantar la
 * app. Se resuelve la CLI desde `node_modules` (no como programa global): acá
 * está instalada como devDependency, igual que en `tests/setup/globalSetup.ts`.
 *
 * El punto de anclaje del `createRequire` es el `package.json` del proyecto y no
 * `import.meta.url`: Playwright transpila este archivo a CommonJS, donde
 * `import.meta` no existe.
 */
function configSupabaseLocal(): Record<string, string> {
  const require = createRequire(join(process.cwd(), "package.json"));
  const cli = require.resolve("supabase/dist/supabase.js");

  const salida = execFileSync(process.execPath, [cli, "status", "-o", "json"], {
    encoding: "utf8",
  });
  const status = JSON.parse(salida) as Record<string, string>;

  if (!status.API_URL || !status.ANON_KEY) {
    throw new Error(
      "Supabase local no está corriendo o no devolvió las claves. Corré `npm run db:start`."
    );
  }
  return status;
}

const status = configSupabaseLocal();

// Puerto 3100 a propósito: el 3000 lo usa el dueño del repo para su `npm run dev`
// y Next bloquea una segunda instancia por el lock de `.next/`.
const BASE_URL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run start -- --port 3100",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
      // Los mails de confirmación/recuperación construyen su link con este valor.
      // Debe apuntar al puerto del E2E (3100), no al 3000 del dev del dueño.
      NEXT_PUBLIC_SITE_URL: BASE_URL,
    },
  },
});
