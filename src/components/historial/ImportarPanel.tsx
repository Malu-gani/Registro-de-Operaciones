"use client";

import { useMemo, useState } from "react";
import type { CuentaId } from "@/types/trading";
import type { PlataformaImport } from "@/lib/importExport/universalOperation";
import type { IndicesColumnas, TablaCruda } from "@/lib/importExport/parsers/baseParser";
import { leerArchivo } from "@/lib/importExport/parsers/baseParser";
import { PARSERS, PLATAFORMAS_IMPORT } from "@/lib/importExport/parsers";
import { reconstruirFIFO } from "@/lib/importExport/fifoReconstruction";
import {
  faltantePorCuenta,
  importarOperaciones,
  type ResultadoImportacion,
} from "@/lib/importExport/importar";
import { usePortafolios, TODOS_LOS_PORTAFOLIOS } from "@/context/PortafoliosContext";
import { useTrades } from "@/context/TradesContext";
import { useCuentas } from "@/context/CuentasContext";

const inputClasses =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";
const labelClasses = "text-xs font-medium text-foreground-muted";

const CUENTA_LABEL: Record<CuentaId, string> = {
  ars: "Pesos (ARS)",
  usd: "Dólares (USD)",
  usdt_spot: "USDT Spot",
  usdt_futuros: "USDT Futuros",
};

/**
 * Panel de importación de historial (Fase B — completo). Flujo:
 *  1) elegir plataforma y archivo (CSV/Excel),
 *  2) revisar/ajustar el mapeo de columnas (fallback manual),
 *  3) previsualizar las operaciones reconstruidas (FIFO),
 *  4) elegir portafolio y confirmar: se dan de alta contra saldos.
 */
export default function ImportarPanel() {
  const [plataforma, setPlataforma] = useState<PlataformaImport>("iol");
  const [tabla, setTabla] = useState<TablaCruda | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [indices, setIndices] = useState<IndicesColumnas>({});
  const [cargando, setCargando] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  const { portafolios } = usePortafolios();
  const { recargar } = useTrades();
  const { refrescar } = useCuentas();
  const [portafolioId, setPortafolioId] = useState("");
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<ResultadoImportacion | null>(null);

  const parser = PARSERS[plataforma];

  const resultado = useMemo(
    () => (tabla && parser ? parser.mapear(tabla, indices) : null),
    [tabla, parser, indices]
  );
  const operaciones = useMemo(
    () => (resultado ? reconstruirFIFO(resultado.movimientos) : []),
    [resultado]
  );

  const cambiarPlataforma = (p: PlataformaImport) => {
    setPlataforma(p);
    setTabla(null);
    setNombreArchivo("");
    setIndices({});
    setErrorArchivo(null);
    setResultadoImport(null);
  };

  const onArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !parser) return;
    setNombreArchivo(file.name);
    setErrorArchivo(null);
    setResultadoImport(null);
    setCargando(true);
    try {
      const t = await leerArchivo(file);
      setTabla(t);
      setIndices(parser.detectar(t.headers));
    } catch (err) {
      setErrorArchivo(err instanceof Error ? err.message : "No se pudo leer el archivo.");
      setTabla(null);
    } finally {
      setCargando(false);
      e.target.value = "";
    }
  };

  const setIndice = (campoId: string, valor: number) =>
    setIndices((prev) => ({ ...prev, [campoId]: valor }));

  const confirmarImport = async () => {
    if (!portafolioId || operaciones.length === 0) return;
    setImportando(true);
    setResultadoImport(null);
    try {
      const res = await importarOperaciones(operaciones, portafolioId);
      setResultadoImport(res);
      await Promise.all([recargar(), refrescar()]);
    } catch (err) {
      setErrorArchivo(err instanceof Error ? err.message : "Error al importar.");
    } finally {
      setImportando(false);
    }
  };

  const portafoliosReales = portafolios.filter((p) => p.id !== TODOS_LOS_PORTAFOLIOS);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-risk-yellow-border bg-risk-yellow-bg p-4 text-sm text-risk-yellow">
        Los parsers de IOL y Bitget son provisionales: si alguna columna no se
        detecta sola, asignala a mano abajo. Las operaciones se reconstruyen con
        emparejado FIFO y, al confirmar, se dan de alta ajustando los saldos del
        portafolio elegido.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className={labelClasses} htmlFor="plataforma">Plataforma de origen</label>
          <select
            id="plataforma"
            value={plataforma}
            onChange={(e) => cambiarPlataforma(e.target.value as PlataformaImport)}
            className={inputClasses}
          >
            {PLATAFORMAS_IMPORT.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClasses} htmlFor="archivo">Archivo exportado (CSV o Excel)</label>
          <input
            id="archivo"
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={onArchivo}
            className={`${inputClasses} file:mr-3 file:rounded file:border-0 file:bg-surface-muted file:px-2 file:py-1 file:text-xs file:text-foreground`}
          />
        </div>
      </div>

      {cargando && <p className="text-sm text-foreground-muted">Leyendo {nombreArchivo}...</p>}
      {errorArchivo && (
        <div className="rounded-lg border border-risk-red-border bg-risk-red-bg p-4 text-sm text-risk-red">
          {errorArchivo}
        </div>
      )}

      {tabla && parser && (
        <MapeoColumnas
          campos={parser.campos}
          headers={tabla.headers}
          indices={indices}
          onCambio={setIndice}
        />
      )}

      {resultado && (
        <PreviewOperaciones
          operaciones={operaciones}
          errores={resultado.errores}
          movimientosLeidos={resultado.movimientos.length}
        />
      )}

      {operaciones.length > 0 && (
        <ConfirmarImport
          portafolios={portafoliosReales}
          portafolioId={portafolioId}
          setPortafolioId={setPortafolioId}
          cantidad={operaciones.length}
          importando={importando}
          onConfirmar={confirmarImport}
        />
      )}

      {resultadoImport && <ResultadoImport resultado={resultadoImport} />}
    </div>
  );
}

function MapeoColumnas({
  campos,
  headers,
  indices,
  onCambio,
}: {
  campos: { id: string; label: string; requerido: boolean }[];
  headers: string[];
  indices: IndicesColumnas;
  onCambio: (campoId: string, valor: number) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-sm font-medium text-foreground">Mapeo de columnas</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {campos.map((campo) => {
          const valor = indices[campo.id] ?? -1;
          const faltaRequerido = campo.requerido && valor < 0;
          return (
            <div key={campo.id} className="flex flex-col gap-1">
              <label className={labelClasses} htmlFor={`map-${campo.id}`}>
                {campo.label}
                {campo.requerido && <span className="text-risk-red"> *</span>}
              </label>
              <select
                id={`map-${campo.id}`}
                value={valor}
                onChange={(e) => onCambio(campo.id, Number(e.target.value))}
                className={`${inputClasses} ${faltaRequerido ? "border-risk-red" : ""}`}
              >
                <option value={-1}>— sin asignar —</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>{h || `(columna ${i + 1})`}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PreviewOperaciones({
  operaciones,
  errores,
  movimientosLeidos,
}: {
  operaciones: ReturnType<typeof reconstruirFIFO>;
  errores: { fila: number; motivo: string }[];
  movimientosLeidos: number;
}) {
  const cerradas = operaciones.filter((o) => o.estado === "cerrada").length;
  const abiertas = operaciones.length - cerradas;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-foreground-muted">{movimientosLeidos} ejecuciones leídas</span>
        <span className="font-medium text-foreground">
          {operaciones.length} operaciones ({cerradas} cerradas, {abiertas} abiertas)
        </span>
        {errores.length > 0 && (
          <span className="text-risk-red">{errores.length} filas con problemas</span>
        )}
      </div>

      {operaciones.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-foreground-muted">
                <th className="px-3 py-2 font-medium">Activo</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Op.</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Entrada</th>
                <th className="px-3 py-2 font-medium">Salida</th>
                <th className="px-3 py-2 font-medium">Cantidad</th>
                <th className="px-3 py-2 font-medium">PnL est.</th>
              </tr>
            </thead>
            <tbody>
              {operaciones.map((o, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{o.activo}</td>
                  <td className="px-3 py-2 text-foreground-muted">
                    {o.tipoActivo}{o.subTipoActivo ? ` · ${o.subTipoActivo}` : ""}
                    {o.apalancamiento ? ` · ${o.apalancamiento}x` : ""}
                  </td>
                  <td className="px-3 py-2 capitalize text-foreground-muted">{o.tipoOperacion}</td>
                  <td className="px-3 py-2 text-foreground-muted">{o.estado}</td>
                  <td className="px-3 py-2 text-foreground-muted">
                    {o.fechaEntrada} @ {o.precioEntrada}
                  </td>
                  <td className="px-3 py-2 text-foreground-muted">
                    {o.estado === "cerrada" ? `${o.fechaSalida} @ ${o.precioSalida}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-foreground-muted">{o.cantidad}</td>
                  <td className="px-3 py-2">
                    {o.pnlEstimado === undefined ? (
                      <span className="text-foreground-muted">—</span>
                    ) : (
                      <span className={o.pnlEstimado >= 0 ? "text-risk-green" : "text-risk-red"}>
                        {o.pnlEstimado.toFixed(2)}
                      </span>
                    )}
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
              <li key={i}>{e.fila === 0 ? "Archivo" : `Fila ${e.fila}`}: {e.motivo}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConfirmarImport({
  portafolios,
  portafolioId,
  setPortafolioId,
  cantidad,
  importando,
  onConfirmar,
}: {
  portafolios: { id: string; nombre: string }[];
  portafolioId: string;
  setPortafolioId: (id: string) => void;
  cantidad: number;
  importando: boolean;
  onConfirmar: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <label className={labelClasses} htmlFor="portafolio-destino">Portafolio destino</label>
        <select
          id="portafolio-destino"
          value={portafolioId}
          onChange={(e) => setPortafolioId(e.target.value)}
          className={inputClasses}
        >
          <option value="">Elegí un portafolio…</option>
          {portafolios.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={onConfirmar}
        disabled={!portafolioId || importando}
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
      >
        {importando ? "Importando..." : `Importar ${cantidad} operaciones`}
      </button>
    </div>
  );
}

function ResultadoImport({ resultado }: { resultado: ResultadoImportacion }) {
  const faltantes = faltantePorCuenta(resultado.fallidas);
  const cuentasFaltantes = Object.entries(faltantes) as [CuentaId, number][];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-risk-green-border bg-risk-green-bg p-4 text-sm text-risk-green">
        {resultado.importadas} operaciones importadas correctamente.
      </div>

      {resultado.fallidas.length > 0 && (
        <div className="rounded-xl border border-risk-red-border bg-risk-red-bg p-4">
          <p className="mb-2 text-sm font-medium text-risk-red">
            {resultado.fallidas.length} operaciones no se importaron
          </p>
          {cuentasFaltantes.length > 0 && (
            <div className="mb-3 text-xs text-risk-red">
              Para importarlas, cargá saldo en:
              <ul className="mt-1 flex flex-col gap-0.5">
                {cuentasFaltantes.map(([cuenta, monto]) => (
                  <li key={cuenta}>
                    {CUENTA_LABEL[cuenta]}: falta aprox. {monto.toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="flex flex-col gap-1 text-xs text-risk-red">
            {resultado.fallidas.map((f, i) => (
              <li key={i}>
                {f.activo} ({f.fecha}, {f.tipoOperacion}): {f.motivo}
                {f.costoRequerido !== undefined ? ` (requería ${f.costoRequerido.toFixed(2)})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
