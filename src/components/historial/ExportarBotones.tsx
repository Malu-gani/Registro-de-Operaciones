"use client";

import { useState } from "react";
import type { Trade } from "@/types/trading";
import { exportarCSV } from "@/lib/importExport/export/csvExporter";
import { exportarXLSX } from "@/lib/importExport/export/xlsxExporter";

/**
 * Dos botones para descargar el historial de operaciones en el formato propio
 * unificado (CSV y Excel). Recibe los trades ya listos (el llamador decide el
 * alcance: todo el diario o una pestaña). Se deshabilitan si no hay datos.
 */
export default function ExportarBotones({
  trades,
  base,
}: {
  trades: Trade[];
  base?: string;
}) {
  const [exportandoXlsx, setExportandoXlsx] = useState(false);
  const sinDatos = trades.length === 0;

  const claseBoton =
    "rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted disabled:opacity-60";

  const descargarExcel = async () => {
    setExportandoXlsx(true);
    try {
      await exportarXLSX(trades, base);
    } finally {
      setExportandoXlsx(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => exportarCSV(trades, base)}
        disabled={sinDatos}
        className={claseBoton}
        title={sinDatos ? "No hay operaciones para exportar" : undefined}
      >
        Exportar CSV
      </button>
      <button
        type="button"
        onClick={descargarExcel}
        disabled={sinDatos || exportandoXlsx}
        className={claseBoton}
        title={sinDatos ? "No hay operaciones para exportar" : undefined}
      >
        {exportandoXlsx ? "Exportando..." : "Exportar Excel"}
      </button>
    </div>
  );
}
