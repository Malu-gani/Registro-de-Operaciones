import { createClient } from "./supabase/client";
import type { Divisa, SubTipoAccion, SubTipoCrypto, TipoActivo, Trade } from "@/types/trading";

const supabase = createClient();

interface OperacionRow {
  id: string;
  portafolio_id: string;
  activo: string;
  tipo_activo: TipoActivo;
  sub_tipo_activo: SubTipoAccion | SubTipoCrypto | null;
  divisa: Divisa;
  apalancamiento: number | null;
  tipo_operacion: "long" | "short";
  fecha_entrada: string;
  precio_entrada: number;
  precio_stop_loss: number | null;
  precio_take_profit: number | null;
  cantidad: number;
  fecha_salida: string | null;
  precio_salida: number | null;
  estado: "abierta" | "cerrada";
  resultado_pnl: number | null;
  ratio_riesgo_beneficio: number | null;
  porcentaje_riesgo_cuenta: number | null;
  notas: string | null;
}

function rowToTrade(row: OperacionRow): Trade {
  return {
    id: row.id,
    portafolioId: row.portafolio_id,
    activo: row.activo,
    tipoActivo: row.tipo_activo,
    subTipoActivo: row.sub_tipo_activo ?? undefined,
    divisa: row.divisa,
    apalancamiento: row.apalancamiento ?? undefined,
    tipoOperacion: row.tipo_operacion,
    fechaEntrada: row.fecha_entrada,
    precioEntrada: row.precio_entrada,
    precioStopLoss: row.precio_stop_loss ?? undefined,
    precioTakeProfit: row.precio_take_profit ?? undefined,
    cantidad: row.cantidad,
    fechaSalida: row.fecha_salida ?? undefined,
    precioSalida: row.precio_salida ?? undefined,
    estado: row.estado,
    resultadoPnl: row.resultado_pnl ?? undefined,
    ratioRiesgoBeneficio: row.ratio_riesgo_beneficio ?? undefined,
    porcentajeRiesgoOperacion: row.porcentaje_riesgo_cuenta ?? undefined,
    notas: row.notas ?? undefined,
  };
}

export async function fetchTrades(portafolioId?: string): Promise<Trade[]> {
  let query = supabase
    .from("operaciones")
    .select("*")
    .order("fecha_entrada", { ascending: false });

  if (portafolioId) {
    query = query.eq("portafolio_id", portafolioId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data as OperacionRow[]).map(rowToTrade);
}

/**
 * Abre una operación vía la función `abrir_operacion` (RPC): valida fondos,
 * inserta la operación y debita el Disponible de la cuenta, todo atómico.
 * Puede lanzar 'FONDOS_INSUFICIENTES:<cuenta>'. Devuelve la operación creada.
 */
export async function abrirOperacion(
  trade: Omit<Trade, "id" | "portafolioId">,
  portafolioId: string
): Promise<Trade> {
  const { data: opId, error } = await supabase.rpc("abrir_operacion", {
    p_portafolio_id: portafolioId,
    p_activo: trade.activo,
    p_tipo_activo: trade.tipoActivo,
    p_sub_tipo_activo: trade.subTipoActivo ?? null,
    p_divisa: trade.divisa,
    p_apalancamiento: trade.apalancamiento ?? null,
    p_tipo_operacion: trade.tipoOperacion,
    p_fecha_entrada: trade.fechaEntrada,
    p_precio_entrada: trade.precioEntrada,
    p_precio_stop_loss: trade.precioStopLoss ?? null,
    p_precio_take_profit: trade.precioTakeProfit ?? null,
    p_cantidad: trade.cantidad,
    p_ratio_riesgo_beneficio: trade.ratioRiesgoBeneficio ?? null,
    p_porcentaje_riesgo: trade.porcentajeRiesgoOperacion ?? null,
    p_notas: trade.notas ?? null,
  });

  if (error) throw new Error(error.message);

  const { data: row, error: fetchError } = await supabase
    .from("operaciones")
    .select("*")
    .eq("id", opId as string)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  return rowToTrade(row as OperacionRow);
}

/**
 * Cierra una operación (total o parcial) vía la función `cerrar_operacion`
 * (RPC): acredita los proceeds al Disponible y registra el cierre, atómico.
 */
export async function cerrarOperacion(
  opId: string,
  cierre: { precioSalida: number; fechaSalida: string; cantidadCerrada: number }
): Promise<void> {
  const { error } = await supabase.rpc("cerrar_operacion", {
    p_op_id: opId,
    p_precio_salida: cierre.precioSalida,
    p_fecha_salida: cierre.fechaSalida,
    p_cantidad_cerrada: cierre.cantidadCerrada,
  });

  if (error) throw new Error(error.message);
}
