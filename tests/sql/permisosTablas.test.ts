import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { entornoSupabase } from "../setup/entornoSupabase";

/**
 * Permisos (GRANT) sobre las tablas del schema public — migración 022
 * (OPS-US-15). Defensa en profundidad además de RLS:
 *
 *  - `anon` (sin sesión) no necesita NINGÚN privilegio sobre las tablas: la app
 *    solo usa `anon` para login/registro, que hablan con Auth, no con las tablas.
 *  - `authenticated` solo necesita select/insert/update/delete. TRUNCATE no pasa
 *    por RLS, y TRIGGER y REFERENCES no los usa la app.
 *  - `service_role` no se toca.
 *
 * Los privilegios se leen con `has_table_privilege` por psql dentro del
 * contenedor de la base (igual que scripts/aplicar-migraciones.mjs), porque la
 * API REST no expone el catálogo.
 */

const TABLAS = [
  "portafolios",
  "operaciones",
  "plazos_fijos",
  "cuentas_saldos",
  "movimientos_cuenta",
  "preferencias_usuario",
] as const;

function nombreContenedor(): string {
  const config = readFileSync("supabase/config.toml", "utf8");
  const match = config.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("No se encontró project_id en supabase/config.toml");
  return `supabase_db_${match[1]}`;
}

const ROLES = ["anon", "authenticated", "service_role"];
const PRIVILEGIOS = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];

/** Una sola consulta con todas las combinaciones: un docker exec, no ciento y pico. */
const privilegios = new Map<string, boolean>();

beforeAll(() => {
  const sql = `
    select r, t, p, has_table_privilege(r, 'public.' || t, p)
    from unnest(array['${ROLES.join("','")}']) r,
         unnest(array['${TABLAS.join("','")}']) t,
         unnest(array['${PRIVILEGIOS.join("','")}']) p`;
  const salida = execFileSync(
    "docker",
    ["exec", "-u", "postgres", nombreContenedor(), "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "|", "-c", sql],
    { encoding: "utf8" }
  );
  for (const linea of salida.trim().split(/\r?\n/)) {
    const [r, t, p, v] = linea.split("|");
    privilegios.set(`${r}|${t}|${p}`, v === "t");
  }
});

function tienePrivilegio(rol: string, tabla: string, privilegio: string): boolean {
  const valor = privilegios.get(`${rol}|${tabla}|${privilegio}`);
  if (valor === undefined) throw new Error(`Sin dato para ${rol}/${tabla}/${privilegio}`);
  return valor;
}

describe("anon no tiene ningún privilegio sobre las tablas", () => {
  for (const tabla of TABLAS) {
    for (const privilegio of PRIVILEGIOS) {
      test(`${tabla}: anon sin ${privilegio}`, () => {
        expect(tienePrivilegio("anon", tabla, privilegio)).toBe(false);
      });
    }
  }

  test("por la API, leer una tabla sin sesión da error de permisos (no una lista vacía)", async () => {
    const { url, anonKey } = entornoSupabase();
    const anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anon.from("portafolios").select("id").limit(1);
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });
});

describe("authenticated conserva solo select, insert, update y delete", () => {
  for (const tabla of TABLAS) {
    for (const privilegio of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      test(`${tabla}: authenticated con ${privilegio}`, () => {
        expect(tienePrivilegio("authenticated", tabla, privilegio)).toBe(true);
      });
    }
    for (const privilegio of ["TRUNCATE", "REFERENCES", "TRIGGER"]) {
      test(`${tabla}: authenticated sin ${privilegio}`, () => {
        expect(tienePrivilegio("authenticated", tabla, privilegio)).toBe(false);
      });
    }
  }
});

describe("service_role no se toca", () => {
  for (const tabla of TABLAS) {
    test(`${tabla}: service_role conserva select, insert, update y delete`, () => {
      for (const privilegio of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        expect(tienePrivilegio("service_role", tabla, privilegio)).toBe(true);
      }
    });
  }
});
