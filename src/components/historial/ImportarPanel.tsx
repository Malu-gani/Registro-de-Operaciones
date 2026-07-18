"use client";

import { useMemo, useState } from "react";
import type { CuentaId } from "@/types/trading";
import type { ErrorFila, PlataformaImport } from "@/lib/importExport/universalOperation";
import type { IndicesColumnas, TablaCruda } from "@/lib/importExport/parsers/baseParser";
import { leerArchivo } from "@/lib/importExport/parsers/baseParser";
import { PARSERS, PLATAFORMAS_IMPORT } from "@/lib/importExport/parsers";
import { reconstruirFIFO, type OperacionReconstruida } from "@/lib/importExport/fifoReconstruction";
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
  const sinFifo = parser?.sinFifo ?? false;

  // Reconstrucción unificada: los parsers de ejecuciones sueltas (iol/bitget)
  // pasan por FIFO; el formato propio ya trae operaciones redondas.
  const parseo = useMemo<{
    operaciones: OperacionReconstruida[];
    errores: ErrorFila[];
    leidos: number;
    ignoradas: number;
  }>(() => {
    if (!tabla || !parser) return { operaciones: [], errores: [], leidos: 0, ignoradas: 0 };
    if (parser.sinFifo && parser.mapearOperaciones) {
      const r = parser.mapearOperaciones(tabla, indices);
      return {
        operaciones: r.operaciones,
        errores: r.errores,
        leidos: r.operaciones.length,
        ignoradas: r.ignoradas ?? 0,
      };
    }
    const r = parser.mapear(tabla, indices);
    return {
      operaciones: reconstruirFIFO(r.movimientos),
      errores: r.errores,
      leidos: r.movimientos.length,
      ignoradas: 0,
    };
  }, [tabla, parser, indices]);

  const operaciones = parseo.operaciones;

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
        {sinFifo ? (
          <>
            Estás re-importando el formato propio del diario: cada fila ya es una
            operación completa (abierta o cerrada), así que no se reconstruye por
            FIFO, se carga tal cual. Las filas de plazos fijos u otras que no sean
            operaciones se ignoran. Al confirmar, las operaciones se dan de alta y
            se ajustan los saldos del portafolio que elijas.
          </>
        ) : (
          <>
            La lectura automática de las columnas de IOL y Bitget todavía está en
            pruebas: si el sistema no reconoce sola alguna columna, asignala a mano
            en la sección de abajo. Con esos datos armamos cada operación
            emparejando tus compras y ventas por orden de antigüedad (método FIFO:
            la primera compra se cierra con la primera venta, y así sucesivamente).
            Al confirmar, las operaciones se dan de alta y se ajustan los saldos del
            portafolio que elijas.
          </>
        )}
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
          <div className={`${inputClasses} flex items-center gap-3`}>
            <label
              htmlFor="archivo"
              className="cursor-pointer rounded border-0 bg-surface-muted px-2 py-1 text-xs text-foreground hover:opacity-90"
            >
              Seleccionar archivo
            </label>
            <span className="truncate text-xs text-foreground-muted">
              {nombreArchivo || "Sin archivo seleccionado"}
            </span>
            <input
              id="archivo"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={onArchivo}
              className="hidden"
            />
          </div>
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

      {tabla && parser && (
        <PreviewOperaciones
          operaciones={operaciones}
          errores={parseo.errores}
          leidos={parseo.leidos}
          ignoradas={parseo.ignoradas}
          sinFifo={sinFifo}
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
  leidos,
  ignoradas = 0,
  sinFifo = false,
}: {
  operaciones: OperacionReconstruida[];
  errores: { fila: number; motivo: string }[];
  leidos: number;
  ignoradas?: number;
  sinFifo?: boolean;
}) {
  const cerradas = operaciones.filter((o) => o.estado === "cerrada").length;
  const abiertas = operaciones.length - cerradas;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-foreground-muted">
          {sinFifo ? `${leidos} operaciones leídas` : `${leidos} ejecuciones leídas`}
        </span>
        <span className="font-medium text-foreground">
          {operaciones.length} operaciones ({cerradas} cerradas, {abiertas} abiertas)
        </span>
        {ignoradas > 0 && (
          <span className="text-foreground-muted">{ignoradas} filas ignoradas</span>
        )}
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

  const { importadas } = resultado;
  const seCargoAlgo = importadas > 0;
  const mensajeResultado = seCargoAlgo
    ? `${importadas} ${importadas === 1 ? "operación cargada" : "operaciones cargadas"} correctamente.`
    : "No se pudo cargar ninguna operación.";

  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          seCargoAlgo
            ? "rounded-xl border border-risk-green-border bg-risk-green-bg p-4 text-sm text-risk-green"
            : "rounded-xl border border-border bg-surface p-4 text-sm text-foreground-muted"
        }
      >
        {mensajeResultado}
      </div>

      {resultado.fallidas.length > 0 && (
        <div className="rounded-xl border border-risk-red-border bg-risk-red-bg p-4">
          <p className="mb-2 text-sm font-medium text-risk-red">
            {resultado.fallidas.length === 1
              ? "1 operación no se pudo cargar"
              : `${resultado.fallidas.length} operaciones no se pudieron cargar`}
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
