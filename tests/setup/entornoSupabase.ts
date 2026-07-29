import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

interface Entorno {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

let cache: Entorno | null = null;

/**
 * La CLI de Supabase es una devDependency del proyecto, no un programa global.
 * Se la invoca por su entrypoint de Node en vez de por el nombre `supabase`,
 * así no depende del PATH ni de un `.cmd` de Windows: corre igual acá y en CI.
 */
function cliSupabase(): string {
  const require = createRequire(import.meta.url);
  return require.resolve("supabase/dist/supabase.js");
}

/**
 * Lee la config de la instancia local con `supabase status`. No se hardcodean
 * las claves: cambian entre versiones de la CLI, y ninguna credencial del
 * proyecto real de Supabase entra en los tests.
 */
export function entornoSupabase(): Entorno {
  if (cache) return cache;

  let salida: string;
  try {
    salida = execFileSync(process.execPath, [cliSupabase(), "status", "-o", "json"], {
      encoding: "utf8",
    });
  } catch (error) {
    throw new Error(
      "No se pudo consultar el estado de Supabase local. ¿Corriste `npx supabase start`? " +
        `Detalle: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const status = JSON.parse(salida) as Record<string, string>;

  const url = status.API_URL;
  const anonKey = status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "No se pudo leer la config de Supabase local. ¿Corriste `npx supabase start`?"
    );
  }

  cache = { url, anonKey, serviceRoleKey };
  return cache;
}
