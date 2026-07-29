interface Entorno {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

let cache: Entorno | null = null;

/**
 * Lee la config de la instancia local desde el entorno. Quien la consulta es
 * `globalSetup.ts`, una sola vez y antes de que arranquen los workers — ver ahí
 * por qué no se consulta desde cada archivo de test.
 *
 * No se hardcodean las claves: cambian entre versiones de la CLI, y ninguna
 * credencial del proyecto real de Supabase entra en los tests.
 */
export function entornoSupabase(): Entorno {
  if (cache) return cache;

  const url = process.env.SUPABASE_TEST_URL;
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Falta la config de Supabase local en el entorno. Los tests SQL se corren " +
        "con `npm run test:sql`, que arranca el globalSetup encargado de leerla. " +
        "Si el error aparece igual, verificá que la instancia esté levantada con " +
        "`npm run db:start`."
    );
  }

  cache = { url, anonKey, serviceRoleKey };
  return cache;
}
