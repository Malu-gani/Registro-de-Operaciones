import type { Trade } from "@/types/trading";
import { EXPORT_HEADERS, tradeToRow } from "./tradeToRow";
import { nombreConFecha } from "./descargar";

/**
 * Exporta las operaciones a un archivo Excel (.xlsx) descargable usando SheetJS.
 * La librería se importa dinámicamente para no cargarla salvo que se use.
 * Las columnas se fuerzan con `header: EXPORT_HEADERS` para respetar el mismo
 * orden que el CSV.
 */
export async function exportarXLSX(
  trades: Trade[],
  base = "historial-operaciones"
): Promise<void> {
  const XLSX = await import("xlsx");
  const filas = trades.map(tradeToRow);
  const hoja = XLSX.utils.json_to_sheet(filas, {
    header: EXPORT_HEADERS as unknown as string[],
  });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Historial");
  XLSX.writeFile(libro, nombreConFecha(base, "xlsx"));
}
