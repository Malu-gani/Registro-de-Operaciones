import type { Trade } from "@/types/trading";
import { EXPORT_HEADERS, tradeToRow, type ExportRow } from "./tradeToRow";
import { descargarBlob, nombreConFecha } from "./descargar";

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

/** Serializa las filas a una cadena CSV con encabezados del formato propio. */
function filasACsv(filas: ExportRow[]): string {
  const encabezado = EXPORT_HEADERS.map(escaparCampo).join(",");
  const lineas = filas.map((fila) =>
    EXPORT_HEADERS.map((h) => escaparCampo(fila[h])).join(",")
  );
  return [encabezado, ...lineas].join("\r\n");
}

/**
 * Convierte una lista de operaciones a la cadena CSV del formato propio.
 * Función pura (sin APIs del navegador): testeable y reutilizable.
 */
export function tradesACsvString(trades: Trade[]): string {
  return filasACsv(trades.map(tradeToRow));
}

/**
 * Exporta las operaciones a un archivo CSV descargable. Antepone un BOM (﻿)
 * para que Excel abra los acentos correctamente.
 */
export function exportarCSV(trades: Trade[], base = "historial-operaciones"): void {
  const csv = tradesACsvString(trades);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  descargarBlob(blob, nombreConFecha(base, "csv"));
}
