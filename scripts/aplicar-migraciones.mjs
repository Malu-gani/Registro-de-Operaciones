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
 * Las migraciones se aplican como `supabase_admin`, no como `postgres`.
 *
 * En el esquema public conviven dos juegos de permisos por defecto: los que
 * otorga supabase_admin dan arwdDxtm a anon/authenticated/service_role, y los
 * que otorga postgres dan solo Dxtm — sin SELECT/INSERT/UPDATE/DELETE. Como el
 * esquema del repo nunca hace GRANT explícito (hereda el default del entorno),
 * crear las tablas como postgres las deja ilegibles para los usuarios logueados
 * y todo falla con "permission denied", antes incluso de llegar a RLS.
 */
const USUARIO_DB = "supabase_admin";

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
