"use client";

import { useState } from "react";
import type { PlataformaImport, ResultadoParseo } from "@/lib/importExport/universalOperation";
import { PARSERS, PLATAFORMAS_IMPORT } from "@/lib/importExport/parsers";

/**
 * Panel de importación de historial (Fase B — PREVIEW). Deja elegir plataforma
 * y archivo, corre el parser y muestra los movimientos interpretados + las filas
 * descartadas con su motivo. Todavía NO persiste: la reconstrucción de
 * operaciones y el alta contra saldos se deciden sobre datos reales.
 */
export default function ImportarPanel() {
  const [plataforma, setPlataforma] = useState<PlataformaImport>("iol");
  const [resultado, setResultado] = useState<ResultadoParseo | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState<string>("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNombreArchivo(file.name);
    setError(null);
    setResultado(null);
    setCargando(true);
    try {
      const parser = PARSERS[plataforma];
      if (!parser) throw new Error("Plataforma sin parser disponible.");
      setResultado(await parser.parse(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setCargando(false);
      // permitir re-seleccionar el mismo archivo
      e.target.value = "";
    }
  };

  const inputClasses =
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";
  const labelClasses = "text-xs font-medium text-foreground-muted";

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-risk-yellow-border bg-risk-yellow-bg p-4 text-sm text-risk-yellow">
        Vista previa de importación. Por ahora solo se leen y muestran los datos
        para verificar el mapeo de columnas; todavía no se guardan operaciones ni
        se tocan los saldos.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className={labelClasses} htmlFor="plataforma">
            Plataforma de origen
          </label>
          <select
            id="plataforma"
            value={plataforma}
            onChange={(e) => setPlataforma(e.target.value as PlataformaImport)}
            className={inputClasses}
          >
            {PLATAFORMAS_IMPORT.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClasses} htmlFor="archivo">
            Archivo exportado (CSV o Excel)
          </label>
          <input
            id="archivo"
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={onArchivo}
            className={`${inputClasses} file:mr-3 file:rounded file:border-0 file:bg-surface-muted file:px-2 file:py-1 file:text-xs file:text-foreground`}
          />
        </div>
      </div>

      {cargando && (
        <p className="text-sm text-foreground-muted">Leyendo {nombreArchivo}...</p>
      )}

      {error && (
        <div className="rounded-lg border border-risk-red-border bg-risk-red-bg p-4 text-sm text-risk-red">
          {error}
        </div>
      )}

      {resultado && !cargando && (
        <ResultadoPreview resultado={resultado} nombreArchivo={nombreArchivo} />
      )}
    </div>
  );
}

function ResultadoPreview({
  resultado,
  nombreArchivo,
}: {
  resultado: ResultadoParseo;
  nombreArchivo: string;
}) {
  const { movimientos, errores } = resultado;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="font-medium text-foreground">{nombreArchivo}</span>
        <span className="text-risk-green">{movimientos.length} movimientos leídos</span>
        {errores.length > 0 && (
          <span className="text-risk-red">{errores.length} filas con problemas</span>
        )}
      </div>

      {movimientos.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-foreground-muted">
                <th className="px-3 py-2 font-medium">Fila</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Activo</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Lado</th>
                <th className="px-3 py-2 font-medium">Cantidad</th>
                <th className="px-3 py-2 font-medium">Precio</th>
                <th className="px-3 py-2 font-medium">Apal.</th>
                <th className="px-3 py-2 font-medium">PnL</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.filaOriginal} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-foreground-muted">{m.filaOriginal}</td>
                  <td className="px-3 py-2 text-foreground-muted">{m.fecha}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{m.activo}</td>
                  <td className="px-3 py-2 text-foreground-muted">
                    {m.tipoActivo}
                    {m.subTipoActivo ? ` · ${m.subTipoActivo}` : ""}
                  </td>
                  <td className="px-3 py-2 capitalize text-foreground-muted">{m.lado}</td>
                  <td className="px-3 py-2 text-foreground-muted">{m.cantidad}</td>
                  <td className="px-3 py-2 text-foreground-muted">{m.precio}</td>
                  <td className="px-3 py-2 text-foreground-muted">
                    {m.apalancamiento ? `${m.apalancamiento}x` : "—"}
                  </td>
                  <td className="px-3 py-2 text-foreground-muted">
                    {m.pnlRealizado ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {errores.length > 0 && (
        <div className="rounded-xl border border-risk-red-border bg-risk-red-bg p-4">
          <p className="mb-2 text-sm font-medium text-risk-red">Filas descartadas</p>
          <ul className="flex flex-col gap-1 text-xs text-risk-red">
            {errores.map((e, i) => (
              <li key={i}>
                {e.fila === 0 ? "Archivo" : `Fila ${e.fila}`}: {e.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
