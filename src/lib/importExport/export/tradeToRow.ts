import type { Trade } from "@/types/trading";

/**
 * Capa de Dominio (exportación): el "formato propio" unificado. Una fila plana
 * por operación, con encabezados en español estables. Los valores de los campos
 * enumerados (Tipo activo, Sub tipo, Operación, Estado) se dejan con su valor
 * crudo del modelo (`acciones`/`crypto`, `long`/`short`, etc.) para que el
 * archivo sirva de contrato de re-importación en el futuro.
 *
 * `EXPORT_HEADERS` es la única fuente de verdad del orden de columnas: tanto el
 * exportador CSV como el XLSX derivan sus columnas de acá, así ambos formatos
 * quedan idénticos.
 */
export const EXPORT_HEADERS = [
  "Fecha entrada",
  "Fecha salida",
  "Activo",
  "Tipo activo",
  "Sub tipo",
  "Divisa",
  "Operación",
  "Apalancamiento",
  "Cantidad",
  "Precio entrada",
  "Precio salida",
  "Stop Loss",
  "Take Profit",
  "R:R",
  "% Riesgo",
  "PnL",
  "Estado",
  "Notas",
] as const;

export type ExportHeader = (typeof EXPORT_HEADERS)[number];

/** Fila lista para serializar. Los campos vacíos van como "" (celda en blanco). */
export type ExportRow = Record<ExportHeader, string | number>;

/** Devuelve el valor si está definido; si no, cadena vacía (celda en blanco). */
function opt(valor: number | string | undefined): string | number {
  return valor ?? "";
}

/** Mapea un `Trade` del diario a una fila del formato propio de exportación. */
export function tradeToRow(trade: Trade): ExportRow {
  return {
    "Fecha entrada": trade.fechaEntrada,
    "Fecha salida": opt(trade.fechaSalida),
    Activo: trade.activo,
    "Tipo activo": trade.tipoActivo,
    "Sub tipo": opt(trade.subTipoActivo),
    Divisa: trade.divisa,
    Operación: trade.tipoOperacion,
    Apalancamiento: opt(trade.apalancamiento),
    Cantidad: trade.cantidad,
    "Precio entrada": trade.precioEntrada,
    "Precio salida": opt(trade.precioSalida),
    "Stop Loss": opt(trade.precioStopLoss),
    "Take Profit": opt(trade.precioTakeProfit),
    "R:R": opt(trade.ratioRiesgoBeneficio),
    "% Riesgo": opt(trade.porcentajeRiesgoOperacion),
    PnL: opt(trade.resultadoPnl),
    Estado: trade.estado,
    Notas: opt(trade.notas),
  };
}
