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
