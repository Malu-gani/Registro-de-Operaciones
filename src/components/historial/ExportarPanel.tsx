"use client";

import { useMemo, useState } from "react";
import type { PlazoFijo, Trade } from "@/types/trading";
import {
  SEGMENTOS_OPERACION,
  filtrarPlazos,
  filtrarTrades,
  type EstadoFiltro,
} from "@/lib/importExport/export/segmentos";
import { EXPORT_HEADERS, tradeToRow } from "@/lib/importExport/export/tradeToRow";
import {
  PLAZO_FIJO_HEADERS,
  plazoFijoToRow,
} from "@/lib/importExport/export/plazoFijoToRow";
import { exportarCSVTabla } from "@/lib/importExport/export/csvExporter";
import {
  exportarXLSXMultihoja,
  type HojaExport,
} from "@/lib/importExport/export/xlsxExporter";

type Formato = "csv" | "xlsx";
type FilaSeleccion = { incluido: boolean; estado: EstadoFiltro };

const ID_PLAZOS = "plazos-fijos";

/** Descriptores de las 5 filas del panel (4 segmentos de operación + plazos). */
const FILAS = [
  ...SEGMENTOS_OPERACION.map((s) => ({ id: s.id, label: s.label })),
  { id: ID_PLAZOS, label: "Plazos Fijos" },
];

function seleccionInicial(): Record<string, FilaSeleccion> {
  const base: Record<string, FilaSeleccion> = {};
  for (const f of FILAS) base[f.id] = { incluido: false, estado: "todas" };
  return base;
}

/**
 * Panel de exportación segmentada. El usuario tilda qué tipos incluir y, por
 * cada tipo, filtra por estado (todas / abiertas / cerradas). El alcance es el
 * del portafolio activo, porque `trades`/`plazosFijos` ya vienen filtrados por
 * el contexto (o todos, si el selector global está en "todos").
 *
 * Formato de salida:
 * - Excel: un archivo con hoja "Operaciones" + hoja "Plazos Fijos" (esquemas
 *   distintos, por eso van en hojas separadas).
 * - CSV: una tabla por esquema → si se eligen operaciones y plazos, se descargan
 *   dos archivos.
 */
export default function ExportarPanel({
  trades,
  plazosFijos,
  base = "historial",
}: {
  trades: Trade[];
  plazosFijos: PlazoFijo[];
  base?: string;
}) {
  const [seleccion, setSeleccion] = useState<Record<string, FilaSeleccion>>(
    seleccionInicial
  );
  const [formato, setFormato] = useState<Formato>("xlsx");
  const [exportando, setExportando] = useState(false);

  // Operaciones a exportar: concatena los segmentos tildados, ordenadas por
  // fecha de entrada (para preservar el orden cronológico del re-import).
  const filasOperaciones = useMemo(() => {
    const ops: Trade[] = [];
    for (const seg of SEGMENTOS_OPERACION) {
      const sel = seleccion[seg.id];
      if (sel?.incluido) ops.push(...filtrarTrades(trades, seg, sel.estado));
    }
    ops.sort((a, b) => a.fechaEntrada.localeCompare(b.fechaEntrada));
    return ops.map(tradeToRow);
  }, [seleccion, trades]);

  const filasPlazos = useMemo(() => {
    const sel = seleccion[ID_PLAZOS];
    if (!sel?.incluido) return [];
    return filtrarPlazos(plazosFijos, sel.estado).map(plazoFijoToRow);
  }, [seleccion, plazosFijos]);

  const totalFilas = filasOperaciones.length + filasPlazos.length;
  const nadaIncluido = FILAS.every((f) => !seleccion[f.id]?.incluido);
  const deshabilitado = nadaIncluido || totalFilas === 0 || exportando;

  const setIncluido = (id: string, incluido: boolean) =>
    setSeleccion((prev) => ({ ...prev, [id]: { ...prev[id], incluido } }));
  const setEstado = (id: string, estado: EstadoFiltro) =>
    setSeleccion((prev) => ({ ...prev, [id]: { ...prev[id], estado } }));

  const exportar = async () => {
    setExportando(true);
    try {
      if (formato === "csv") {
        // CSV no admite dos esquemas en una tabla → una descarga por esquema.
        if (filasOperaciones.length > 0) {
          exportarCSVTabla(EXPORT_HEADERS, filasOperaciones, `${base}-operaciones`);
        }
        if (filasPlazos.length > 0) {
          exportarCSVTabla(PLAZO_FIJO_HEADERS, filasPlazos, `${base}-plazos-fijos`);
        }
      } else {
        const hojas: HojaExport[] = [];
        if (filasOperaciones.length > 0) {
          hojas.push({ nombre: "Operaciones", headers: EXPORT_HEADERS, filas: filasOperaciones });
        }
        if (filasPlazos.length > 0) {
          hojas.push({ nombre: "Plazos Fijos", headers: PLAZO_FIJO_HEADERS, filas: filasPlazos });
        }
        await exportarXLSXMultihoja(hojas, base);
      }
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-foreground">Exportar historial</p>

      <div className="space-y-2">
        {FILAS.map((fila) => {
          const sel = seleccion[fila.id];
          return (
            <div key={fila.id} className="flex items-center gap-3">
              <label className="flex flex-1 items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={sel.incluido}
                  onChange={(e) => setIncluido(fila.id, e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                {fila.label}
              </label>
              <select
                value={sel.estado}
                onChange={(e) => setEstado(fila.id, e.target.value as EstadoFiltro)}
                disabled={!sel.incluido}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground disabled:opacity-50"
              >
                <option value="todas">Todas</option>
                <option value="abiertas">Abiertas</option>
                <option value="cerradas">Cerradas</option>
              </select>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-foreground-muted">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="formato-export"
              checked={formato === "xlsx"}
              onChange={() => setFormato("xlsx")}
            />
            Excel
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="formato-export"
              checked={formato === "csv"}
              onChange={() => setFormato("csv")}
            />
            CSV
          </label>
          <span>
            {totalFilas} {totalFilas === 1 ? "registro" : "registros"}
          </span>
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={deshabilitado}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted disabled:opacity-60"
          title={
            deshabilitado && !exportando
              ? "Elegí al menos un tipo con registros para exportar"
              : undefined
          }
        >
          {exportando ? "Exportando..." : "Exportar"}
        </button>
      </div>
    </div>
  );
}
