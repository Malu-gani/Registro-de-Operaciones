import { createClient } from "./supabase/client";
import type { CuentaId, MovimientoCuenta, TipoMovimientoCuenta } from "@/types/trading";

const supabase = createClient();

interface MovimientoCuentaRow {
  id: string;
  portafolio_id: string;
  cuenta: CuentaId;
  tipo: TipoMovimientoCuenta;
  monto: number;
  fecha: string;
  notas: string | null;
  ref_operacion_id: string | null;
}

function rowToMovimiento(row: MovimientoCuentaRow): MovimientoCuenta {
  return {
    id: row.id,
    portafolioId: row.portafolio_id,
    cuenta: row.cuenta,
    tipo: row.tipo,
    monto: row.monto,
    fecha: row.fecha,
    notas: row.notas ?? undefined,
    refOperacionId: row.ref_operacion_id ?? undefined,
  };
}

export async function fetchMovimientosCuenta(
  portafolioId?: string
): Promise<MovimientoCuenta[]> {
  let query = supabase
    .from("movimientos_cuenta")
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (portafolioId) {
    query = query.eq("portafolio_id", portafolioId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data as MovimientoCuentaRow[]).map(rowToMovimiento);
}
