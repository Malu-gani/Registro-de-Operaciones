import { createClient } from "./supabase/client";
import type { PlazoFijo } from "@/types/trading";

const supabase = createClient();

interface PlazoFijoRow {
  id: string;
  portafolio_id: string;
  monto: number;
  divisa: "USD" | "ARS";
  tasa_tna: number;
  plazo_dias: number;
  fecha_inicio: string;
  fecha_vencimiento: string;
  interes_estimado: number;
  notas: string | null;
}

function rowToPlazoFijo(row: PlazoFijoRow): PlazoFijo {
  return {
    id: row.id,
    portafolioId: row.portafolio_id,
    monto: row.monto,
    divisa: row.divisa,
    tasaTna: row.tasa_tna,
    plazoDias: row.plazo_dias,
    fechaInicio: row.fecha_inicio,
    fechaVencimiento: row.fecha_vencimiento,
    interesEstimado: row.interes_estimado,
    notas: row.notas ?? undefined,
  };
}

export async function fetchPlazosFijos(portafolioId?: string): Promise<PlazoFijo[]> {
  let query = supabase
    .from("plazos_fijos")
    .select("*")
    .order("fecha_inicio", { ascending: false });

  if (portafolioId) {
    query = query.eq("portafolio_id", portafolioId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data as PlazoFijoRow[]).map(rowToPlazoFijo);
}

export async function insertPlazoFijo(
  plazoFijo: Omit<PlazoFijo, "id" | "portafolioId">,
  portafolioId: string
): Promise<PlazoFijo> {
  const { data, error } = await supabase
    .from("plazos_fijos")
    .insert({
      portafolio_id: portafolioId,
      monto: plazoFijo.monto,
      divisa: plazoFijo.divisa,
      tasa_tna: plazoFijo.tasaTna,
      plazo_dias: plazoFijo.plazoDias,
      fecha_inicio: plazoFijo.fechaInicio,
      fecha_vencimiento: plazoFijo.fechaVencimiento,
      interes_estimado: plazoFijo.interesEstimado,
      notas: plazoFijo.notas ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return rowToPlazoFijo(data as PlazoFijoRow);
}
