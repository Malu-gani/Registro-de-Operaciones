import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

/**
 * Consulta la config de Supabase local UNA sola vez, antes de que Vitest levante
 * los workers, y la deja en el entorno para que la hereden todos.
 *
 * Por qué no consultarla desde cada archivo de test: la CLI de Supabase escribe
 * su archivo de telemetría (~/.supabase/telemetry.json) con la técnica de
 * temporal + rename. Con varios archivos de test en paralelo, varios procesos de
 * la CLI compiten por ese rename y en Windows uno falla con
 * "FileSystem.rename", tumbando el test que perdió la carrera. Era una
 * intermitencia que aparecía recién con 3 o más archivos.
 *
 * De paso, la suite se ahorra un arranque de la CLI (~1,5 s) por archivo.
 */
export default function setup() {
  const require = createRequire(import.meta.url);
  const cli = require.resolve("supabase/dist/supabase.js");

  const salida = execFileSync(process.execPath, [cli, "status", "-o", "json"], {
    encoding: "utf8",
  });
  const status = JSON.parse(salida) as Record<string, string>;

  if (!status.API_URL || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase local no está corriendo o no devolvió las claves. Corré `npm run db:start`."
    );
  }

  process.env.SUPABASE_TEST_URL = status.API_URL;
  process.env.SUPABASE_TEST_ANON_KEY = status.ANON_KEY;
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
}
