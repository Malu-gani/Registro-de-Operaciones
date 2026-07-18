import type { PlazoFijo, Trade } from "@/types/trading";
import { EXPORT_HEADERS, tradeToRow } from "./tradeToRow";
import { PLAZO_FIJO_HEADERS, plazoFijoToRow } from "./plazoFijoToRow";
import { descargarBlob, nombreConFecha } from "./descargar";

/** Una fila genérica: valores indexados por nombre de columna. */
type FilaExport = Record<string, string | number>;

/**
 * Escapa un valor de celda para CSV: si contiene coma, comilla o salto de
 * línea, lo envuelve en comillas dobles y duplica las comillas internas.
 * Los números salen con punto decimal (formato JS por defecto).
 */
function escaparCampo(valor: string | number): string {
  const texto = String(valor);
  if (/[",\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/**
 * Serializa filas a CSV para un juego de headers arbitrario. Función pura
 * (sin APIs del navegador): base común de todos los exportadores CSV.
 */
export function tablaACsvString(
  headers: readonly string[],
  filas: FilaExport[]
): string {
  const encabezado = headers.map(escaparCampo).join(",");
  const lineas = filas.map((fila) =>
    headers.map((h) => escaparCampo(fila[h] ?? "")).join(",")
  );
  return [encabezado, ...lineas].join("\r\n");
}

/** Convierte operaciones a la cadena CSV del formato propio (esquema operaciones). */
export function tradesACsvString(trades: Trade[]): string {
  return tablaACsvString(EXPORT_HEADERS, trades.map(tradeToRow));
}

/** Convierte plazos fijos a la cadena CSV del formato propio (esquema plazos). */
export function plazosACsvString(plazos: PlazoFijo[]): string {
  return tablaACsvString(PLAZO_FIJO_HEADERS, plazos.map(plazoFijoToRow));
}

/**
 * Descarga una tabla como CSV. Antepone un BOM (﻿) para que Excel abra los
 * acentos correctamente. Base común para operaciones y plazos.
 */
export function exportarCSVTabla(
  headers: readonly string[],
  filas: FilaExport[],
  base: string
): void {
  const csv = tablaACsvString(headers, filas);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  descargarBlob(blob, nombreConFecha(base, "csv"));
}

/** Exporta las operaciones a un archivo CSV descargable. */
export function exportarCSV(trades: Trade[], base = "historial-operaciones"): void {
  exportarCSVTabla(EXPORT_HEADERS, trades.map(tradeToRow), base);
}
