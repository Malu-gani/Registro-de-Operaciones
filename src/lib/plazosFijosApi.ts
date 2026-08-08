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
  estado: "pendiente" | "liquidado" | null;
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
    estado: row.estado ?? "pendiente",
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

/**
 * Abre un plazo fijo vía la función `abrir_plazo_fijo` (RPC): valida fondos,
 * inserta el plazo y debita el capital de la cuenta ARS/USD, atómico. Puede
 * lanzar 'FONDOS_INSUFICIENTES:<cuenta>'. Devuelve el plazo creado.
 */
export async function insertPlazoFijo(
  plazoFijo: Omit<PlazoFijo, "id" | "portafolioId" | "estado">,
  portafolioId: string
): Promise<PlazoFijo> {
  const { data: id, error } = await supabase.rpc("abrir_plazo_fijo", {
    p_portafolio_id: portafolioId,
    p_monto: plazoFijo.monto,
    p_divisa: plazoFijo.divisa,
    p_tasa_tna: plazoFijo.tasaTna,
    p_plazo_dias: plazoFijo.plazoDias,
    p_fecha_inicio: plazoFijo.fechaInicio,
    p_fecha_vencimiento: plazoFijo.fechaVencimiento,
    p_interes_estimado: plazoFijo.interesEstimado,
    p_notas: plazoFijo.notas ?? null,
  });

  if (error) throw new Error(error.message);

  const { data: row, error: fetchError } = await supabase
    .from("plazos_fijos")
    .select("*")
    .eq("id", id as string)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  return rowToPlazoFijo(row as PlazoFijoRow);
}

/**
 * Liquida un plazo fijo: acredita capital + interés a la cuenta ARS/USD.
 * `interesReal`, si se pasa, reemplaza el interés estimado original (cuando
 * la tasa pactada no se cumplió tal cual); si se omite, usa el estimado.
 */
export async function liquidarPlazoFijo(
  id: string,
  interesReal?: number
): Promise<void> {
  const { error } = await supabase.rpc("liquidar_plazo_fijo", {
    p_id: id,
    p_interes_real: interesReal ?? null,
  });
  if (error) throw new Error(error.message);
}
