import { createClient } from "./supabase/client";
import type { CuentaId, SaldoCuenta } from "@/types/trading";

const supabase = createClient();

interface SaldoCuentaRow {
  portafolio_id: string;
  cuenta: CuentaId;
  disponible: number;
}

function rowToSaldo(row: SaldoCuentaRow): SaldoCuenta {
  return {
    portafolioId: row.portafolio_id,
    cuenta: row.cuenta,
    disponible: row.disponible,
  };
}

export async function fetchSaldos(portafolioId?: string): Promise<SaldoCuenta[]> {
  let query = supabase
    .from("cuentas_saldos")
    .select("portafolio_id, cuenta, disponible");

  if (portafolioId) {
    query = query.eq("portafolio_id", portafolioId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data as SaldoCuentaRow[]).map(rowToSaldo);
}

/** Fija el Disponible inicial de una cuenta ("cargá tus saldos de hoy"). */
export async function setSaldoInicial(
  portafolioId: string,
  cuenta: CuentaId,
  monto: number
): Promise<void> {
  const { error } = await supabase.rpc("set_saldo_inicial", {
    p_portafolio_id: portafolioId,
    p_cuenta: cuenta,
    p_monto: monto,
  });
  if (error) throw new Error(error.message);
}

/** Depósito o retiro manual sobre el Disponible de una cuenta. */
export async function registrarMovimientoCuenta(
  portafolioId: string,
  cuenta: CuentaId,
  tipo: "deposito" | "retiro",
  monto: number,
  fecha: string,
  notas?: string
): Promise<void> {
  const { error } = await supabase.rpc("registrar_movimiento_cuenta", {
    p_portafolio_id: portafolioId,
    p_cuenta: cuenta,
    p_tipo: tipo,
    p_monto: monto,
    p_fecha: fecha,
    p_notas: notas ?? null,
  });
  if (error) throw new Error(error.message);
}
