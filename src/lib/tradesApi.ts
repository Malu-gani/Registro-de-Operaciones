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

export async function insertTrade(
  trade: Omit<Trade, "id" | "portafolioId">,
  portafolioId: string
): Promise<Trade> {
  const { data, error } = await supabase
    .from("operaciones")
    .insert({
      portafolio_id: portafolioId,
      activo: trade.activo,
      tipo_activo: trade.tipoActivo,
      sub_tipo_activo: trade.subTipoActivo ?? null,
      divisa: trade.divisa,
      apalancamiento: trade.apalancamiento ?? null,
      tipo_operacion: trade.tipoOperacion,
      fecha_entrada: trade.fechaEntrada,
      precio_entrada: trade.precioEntrada,
      precio_stop_loss: trade.precioStopLoss ?? null,
      precio_take_profit: trade.precioTakeProfit ?? null,
      cantidad: trade.cantidad,
      estado: trade.estado,
      ratio_riesgo_beneficio: trade.ratioRiesgoBeneficio ?? null,
      porcentaje_riesgo_cuenta: trade.porcentajeRiesgoOperacion ?? null,
      notas: trade.notas ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return rowToTrade(data as OperacionRow);
}

export async function closeTrade(
  id: string,
  cierre: { fechaSalida: string; precioSalida: number; resultadoPnl: number }
): Promise<Trade> {
  const { data, error } = await supabase
    .from("operaciones")
    .update({
      fecha_salida: cierre.fechaSalida,
      precio_salida: cierre.precioSalida,
      resultado_pnl: cierre.resultadoPnl,
      estado: "cerrada",
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  return rowToTrade(data as OperacionRow);
}

/**
 * Cierre parcial: reduce la cantidad de la posición abierta y crea una
 * fila "cerrada" aparte con la porción vendida y su P&L. Son dos
 * escrituras separadas (no hay transacción atómica en el cliente).
 */
export async function closeTradePartial(
  trade: Trade,
  cierre: {
    fechaSalida: string;
    precioSalida: number;
    resultadoPnl: number;
    cantidadCerrada: number;
  }
): Promise<{ actualizado: Trade; cerrado: Trade }> {
  const cantidadRestante = trade.cantidad - cierre.cantidadCerrada;

  const { data: openData, error: openError } = await supabase
    .from("operaciones")
    .update({ cantidad: cantidadRestante })
    .eq("id", trade.id)
    .select()
    .single();

  if (openError) throw new Error(openError.message);

  const { data: closedData, error: closedError } = await supabase
    .from("operaciones")
    .insert({
      portafolio_id: trade.portafolioId,
      activo: trade.activo,
      tipo_activo: trade.tipoActivo,
      sub_tipo_activo: trade.subTipoActivo ?? null,
      divisa: trade.divisa,
      apalancamiento: trade.apalancamiento ?? null,
      tipo_operacion: trade.tipoOperacion,
      fecha_entrada: trade.fechaEntrada,
      precio_entrada: trade.precioEntrada,
      precio_stop_loss: trade.precioStopLoss ?? null,
      precio_take_profit: trade.precioTakeProfit ?? null,
      cantidad: cierre.cantidadCerrada,
      fecha_salida: cierre.fechaSalida,
      precio_salida: cierre.precioSalida,
      estado: "cerrada",
      resultado_pnl: cierre.resultadoPnl,
      ratio_riesgo_beneficio: trade.ratioRiesgoBeneficio ?? null,
      porcentaje_riesgo_cuenta: trade.porcentajeRiesgoOperacion ?? null,
      notas: trade.notas ?? null,
    })
    .select()
    .single();

  if (closedError) throw new Error(closedError.message);

  return {
    actualizado: rowToTrade(openData as OperacionRow),
    cerrado: rowToTrade(closedData as OperacionRow),
  };
}
