#!/usr/bin/env node
/**
 * Aplica el esquema completo contra la base de Supabase local, en el mismo orden
 * en que el dueño del repo las corre a mano en el SQL Editor.
 *
 * Los .sql se dejan donde están (no se mueven a supabase/migrations/) para no
 * romper ese flujo manual. El psql se ejecuta dentro del contenedor de la base,
 * así no hace falta tener psql instalado en Windows.
 *
 * Uso: node scripts/aplicar-migraciones.mjs
 * Requiere: `npx supabase start` corriendo.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase";

/**
 * Las migraciones se aplican como `postgres`, el rol real con el que el dueño
 * corre el SQL a mano (y con el que se reconstruye cualquier base limpia).
 *
 * Antes acá se usaba `supabase_admin` como atajo: sus "default privileges" le
 * dan arwdDxtm a anon/authenticated/service_role en toda tabla nueva, tapando
 * que el esquema nunca hacía GRANT explícito. Con `postgres` las tablas nacen
 * con solo Dxtm y sin SELECT/INSERT/UPDATE/DELETE, así que la app quedaba
 * ilegible con "permission denied" antes de llegar a RLS. La migración
 * `017_grants_explicitos.sql` volvió explícitos esos permisos, así que ya se
 * puede aplicar con el rol de verdad —que es la prueba de que el repo es
 * autosuficiente para recrear su base (defecto 9.10 del spec de la suite).
 */
const USUARIO_DB = "postgres";

/** El contenedor se llama supabase_db_<project_id>, definido en config.toml. */
function nombreContenedor() {
  const config = readFileSync(join(DIR, "config.toml"), "utf8");
  const match = config.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error("No se encontró project_id en supabase/config.toml");
  }
  return `supabase_db_${match[1]}`;
}

// schema.sql primero; después las numeradas, en orden numérico ascendente.
const numeradas = readdirSync(DIR)
  .filter((f) => /^\d{3}_.*\.sql$/.test(f))
  .sort();

const archivos = ["schema.sql", ...numeradas];
const contenedor = nombreContenedor();

for (const archivo of archivos) {
  process.stdout.write(`Aplicando ${archivo}... `);
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      // El proceso de docker corre como el usuario postgres del contenedor para
      // que psql entre por autenticación local, sin contraseña.
      "-u",
      "postgres",
      contenedor,
      "psql",
      "-U",
      USUARIO_DB,
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    {
      input: readFileSync(join(DIR, archivo), "utf8"),
      stdio: ["pipe", "inherit", "inherit"],
    }
  );
  process.stdout.write("ok\n");
}

console.log(`\n${archivos.length} archivos aplicados.`);
