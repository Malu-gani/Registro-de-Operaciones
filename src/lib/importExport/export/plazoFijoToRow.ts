import type { PlazoFijo } from "@/types/trading";

/**
 * Capa de Dominio (exportación) para plazos fijos. Espejo de `tradeToRow.ts`,
 * pero con su propio juego de columnas: los plazos fijos NO comparten el
 * esquema de las operaciones (no tienen precio de entrada/salida, apalancamiento
 * ni R:R), así que se exportan como una tabla aparte (hoja propia en XLSX,
 * archivo propio en CSV).
 *
 * El valor de `Estado` se deja crudo (`pendiente`/`liquidado`), igual criterio
 * que `EXPORT_HEADERS`, para que el archivo pueda servir de respaldo fiel.
 * Los plazos fijos NO se re-importan (decisión de producto), así que este
 * formato es solo de salida.
 */
export const PLAZO_FIJO_HEADERS = [
  "Fecha inicio",
  "Fecha vencimiento",
  "Monto",
  "Divisa",
  "Tasa TNA",
  "Plazo (días)",
  "Interés estimado",
  "Estado",
  "Notas",
] as const;

export type PlazoFijoHeader = (typeof PLAZO_FIJO_HEADERS)[number];

/** Fila lista para serializar. Los campos vacíos van como "" (celda en blanco). */
export type PlazoFijoRow = Record<PlazoFijoHeader, string | number>;

/** Mapea un `PlazoFijo` a una fila del formato propio de exportación. */
export function plazoFijoToRow(pf: PlazoFijo): PlazoFijoRow {
  return {
    "Fecha inicio": pf.fechaInicio,
    "Fecha vencimiento": pf.fechaVencimiento,
    Monto: pf.monto,
    Divisa: pf.divisa,
    "Tasa TNA": pf.tasaTna,
    "Plazo (días)": pf.plazoDias,
    "Interés estimado": pf.interesEstimado,
    Estado: pf.estado,
    Notas: pf.notas ?? "",
  };
}
