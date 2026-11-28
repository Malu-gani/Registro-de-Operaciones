import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const ejecutar = promisify(execFile);

/** Tope para cada espera. Queda por debajo del statement_timeout de la API. */
const ESPERA_MAXIMA_MS = 6000;

function argumentosPsql(): string[] {
  const config = readFileSync("supabase/config.toml", "utf8");
  const match = config.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("No se encontró project_id en supabase/config.toml");
  return [
    "exec", "-i", "-u", "postgres", `supabase_db_${match[1]}`,
    "psql", "-U", "postgres", "-d", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1",
  ];
}

/** Cuántas sesiones están esperando, directa o indirectamente, a `pid`. */
async function sesionesEnEspera(pid: number): Promise<number> {
  const sql = `
    with recursive cadena(pid) as (
      select a.pid from pg_stat_activity a where ${pid} = any(pg_blocking_pids(a.pid))
      union
      select a.pid from pg_stat_activity a
      join cadena c on c.pid = any(pg_blocking_pids(a.pid))
    )
    select count(*) from cadena`;
  const { stdout } = await ejecutar("docker", [...argumentosPsql(), "-c", sql]);
  return Number(stdout.trim());
}

async function esperarHasta(condicion: () => Promise<boolean>, que: string) {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  while (!(await condicion())) {
    if (Date.now() > limite) throw new Error(`Se agotó la espera: ${que}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Hace que varias llamadas se superpongan de forma determinista, sin depender
 * del azar de los tiempos: una sesión aparte retiene la fila, las llamadas se
 * lanzan de a una (cada una recién cuando la anterior ya está en espera, así el
 * orden queda fijo) y la fila se libera cuando están todas en vuelo.
 *
 * Devuelve los resultados en el mismo orden que las llamadas.
 */
export async function superponerSobreFila<T>(
  tabla: "operaciones" | "plazos_fijos",
  id: string,
  llamadas: Array<() => PromiseLike<T>>
): Promise<T[]> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`Id inválido: ${id}`);

  const sesion = spawn("docker", argumentosPsql(), { stdio: ["pipe", "pipe", "pipe"] });
  let salida = "";
  let errores = "";
  sesion.stdout.on("data", (d) => (salida += d));
  sesion.stderr.on("data", (d) => (errores += d));
  const cierre = new Promise<void>((resolve) => sesion.on("close", () => resolve()));

  const pendientes: Promise<T>[] = [];
  try {
    sesion.stdin.write(
      `begin;\nselect pg_backend_pid() from ${tabla} where id = '${id}' for update;\n`
    );
    await esperarHasta(
      async () => /^\d+\s*$/m.test(salida),
      `retener la fila de ${tabla} ${errores}`
    );
    const pid = Number(salida.match(/^\d+/m)![0]);

    for (const llamada of llamadas) {
      pendientes.push(Promise.resolve(llamada()));
      await esperarHasta(
        async () => (await sesionesEnEspera(pid)) >= pendientes.length,
        `que la llamada ${pendientes.length} quede en espera`
      );
    }
  } finally {
    sesion.stdin.end("commit;\n");
    await cierre;
  }

  return Promise.all(pendientes);
}
