import type { Trade } from "@/types/trading";
import { EXPORT_HEADERS, tradeToRow } from "./tradeToRow";
import { nombreConFecha } from "./descargar";

/** Una hoja del libro: nombre + columnas + filas ya mapeadas. */
export interface HojaExport {
  nombre: string;
  headers: readonly string[];
  filas: Record<string, string | number>[];
}

/**
 * Exporta uno o más juegos de datos a un archivo Excel (.xlsx) con una hoja por
 * elemento. SheetJS se importa dinámicamente para no cargarlo salvo que se use.
 * Las columnas de cada hoja se fuerzan con `header` para respetar el orden.
 * Se usa para combinar operaciones (una hoja) y plazos fijos (otra hoja) en un
 * único archivo, ya que sus esquemas de columnas son distintos.
 */
export async function exportarXLSXMultihoja(
  hojas: HojaExport[],
  base: string
): Promise<void> {
  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();
  for (const { nombre, headers, filas } of hojas) {
    const hoja = XLSX.utils.json_to_sheet(filas, {
      header: headers as unknown as string[],
    });
    XLSX.utils.book_append_sheet(libro, hoja, nombre);
  }
  XLSX.writeFile(libro, nombreConFecha(base, "xlsx"));
}

/** Exporta solo operaciones a un XLSX de una hoja ("Historial"). */
export async function exportarXLSX(
  trades: Trade[],
  base = "historial-operaciones"
): Promise<void> {
  await exportarXLSXMultihoja(
    [{ nombre: "Historial", headers: EXPORT_HEADERS, filas: trades.map(tradeToRow) }],
    base
  );
}
