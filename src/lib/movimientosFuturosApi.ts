import { createClient } from "./supabase/client";
import type { MovimientoFuturos } from "@/types/trading";

const supabase = createClient();

interface MovimientoFuturosRow {
  id: string;
  portafolio_id: string;
  monto: number;
  fecha: string;
  notas: string | null;
}

function rowToMovimientoFuturos(row: MovimientoFuturosRow): MovimientoFuturos {
  return {
    id: row.id,
    portafolioId: row.portafolio_id,
    monto: row.monto,
    fecha: row.fecha,
    notas: row.notas ?? undefined,
  };
}

export async function fetchMovimientosFuturos(
  portafolioId?: string
): Promise<MovimientoFuturos[]> {
  let query = supabase
    .from("movimientos_futuros")
    .select("*")
    .order("fecha", { ascending: false });

  if (portafolioId) {
    query = query.eq("portafolio_id", portafolioId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data as MovimientoFuturosRow[]).map(rowToMovimientoFuturos);
}

export async function insertMovimientoFuturos(
  movimiento: Omit<MovimientoFuturos, "id" | "portafolioId">,
  portafolioId: string
): Promise<MovimientoFuturos> {
  const { data, error } = await supabase
    .from("movimientos_futuros")
    .insert({
      portafolio_id: portafolioId,
      monto: movimiento.monto,
      fecha: movimiento.fecha,
      notas: movimiento.notas ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return rowToMovimientoFuturos(data as MovimientoFuturosRow);
}
