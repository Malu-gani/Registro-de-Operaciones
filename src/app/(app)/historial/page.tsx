"use client";

import { useState } from "react";
import { useTrades } from "@/context/TradesContext";
import { usePlazosFijos } from "@/context/PlazosFijosContext";
import { useCuentas } from "@/context/CuentasContext";
import { useListaPaginada, ControlesListaPaginada } from "@/components/ListaPaginada";
import { useFiltroFechaPreset, SelectorFechaPreset } from "@/components/FiltroFechaPreset";
import { FiltroChips } from "@/components/FiltroChips";
import { plazoFijoVencido } from "@/utils/riskCalculations";
import type { Divisa, TipoActivo, SubTipoAccion, SubTipoCrypto } from "@/types/trading";

type FiltroResultado = "todas" | "ganadoras" | "perdedoras";
const OPCIONES_RESULTADO = [
  { value: "todas", label: "Todas" },
  { value: "ganadoras", label: "Ganadoras" },
  { value: "perdedoras", label: "Perdedoras" },
] as const;

type FiltroDireccion = "todas" | "long" | "short";
const OPCIONES_DIRECCION = [
  { value: "todas", label: "Todas" },
  { value: "long", label: "Long" },
  { value: "short", label: "Short" },
] as const;

type FiltroMoneda = "todas" | "ARS" | "USD";
const OPCIONES_MONEDA = [
  { value: "todas", label: "Todas" },
  { value: "ARS", label: "ARS" },
  { value: "USD", label: "USD" },
] as const;
import EquityCurve from "@/components/EquityCurve";
import ExportarPanel from "@/components/historial/ExportarPanel";
import ImportarPanel from "@/components/historial/ImportarPanel";

const formatoUSD = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const formatoARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

function formatMonto(valor: number, divisa: Divisa) {
  if (divisa === "ARS") return formatoARS.format(valor);
  if (divisa === "USDT") return `${valor >= 0 ? "+" : ""}${valor.toFixed(2)} USDT`;
  return formatoUSD.format(valor);
}

function rrBadgeClass(ratio: number | undefined) {
  if (ratio === undefined) return "bg-surface-muted text-foreground-muted border-border";
  if (ratio < 1) return "bg-risk-red-bg text-risk-red border-risk-red-border";
  if (ratio < 2)
    return "bg-risk-yellow-bg text-risk-yellow border-risk-yellow-border";
  return "bg-risk-green-bg text-risk-green border-risk-green-border";
}

const tabs = [
  { id: "acciones", label: "Acciones" },
  { id: "cedears", label: "CEDEARs" },
  { id: "crypto-futuros", label: "Cripto futuros" },
  { id: "crypto-spot", label: "Cripto spot" },
  { id: "plazos-fijos", label: "Plazos Fijos" },
  { id: "graficos", label: "Gráficos P&L por divisa" },
  { id: "importar", label: "Exportar/importar operaciones" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function TablaOperacionesCerradas({
  tipoActivo,
  subTipoActivo,
  mensajeVacio,
  filtroResultado = false,
  filtroDireccion = false,
}: {
  tipoActivo: TipoActivo;
  subTipoActivo?: SubTipoAccion | SubTipoCrypto;
  mensajeVacio: string;
  /** Muestra chips Ganadoras/Perdedoras (por signo de resultadoPnl). */
  filtroResultado?: boolean;
  /** Muestra chips Long/Short (solo aplica a Cripto futuros). */
  filtroDireccion?: boolean;
}) {
  const { trades, loading, error } = useTrades();
  const [resultado, setResultado] = useState<FiltroResultado>("todas");
  const [direccion, setDireccion] = useState<FiltroDireccion>("todas");

  const ordenadas = trades
    .filter(
      (t) =>
        t.estado === "cerrada" &&
        t.tipoActivo === tipoActivo &&
        (subTipoActivo === undefined || t.subTipoActivo === subTipoActivo)
    )
    .sort((a, b) => b.fechaEntrada.localeCompare(a.fechaEntrada));

  const filtradas = ordenadas.filter((t) => {
    if (filtroResultado && resultado !== "todas") {
      if (t.resultadoPnl === undefined) return false;
      if (resultado === "ganadoras" && t.resultadoPnl < 0) return false;
      if (resultado === "perdedoras" && t.resultadoPnl >= 0) return false;
    }
    if (filtroDireccion && direccion !== "todas" && t.tipoOperacion !== direccion) {
      return false;
    }
    return true;
  });

  const {
    visibles,
    totalCount,
    mostrarVerMas,
    mostrarMinimizar,
    mostrarPaginador,
    pagina,
    totalPaginas,
    verMas,
    colapsar,
    irAPagina,
  } = useListaPaginada(filtradas, { conMinimizar: true });

  if (error) {
    return (
      <div className="rounded-lg border border-risk-red-border bg-risk-red-bg p-4 text-sm text-risk-red">
        {error}
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-foreground-muted">Cargando operaciones...</p>;
  }

  if (ordenadas.length === 0) {
    return <p className="text-sm text-foreground-muted">{mensajeVacio}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {(filtroResultado || filtroDireccion) && (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {filtroDireccion && (
            <FiltroChips
              opciones={OPCIONES_DIRECCION}
              value={direccion}
              onChange={setDireccion}
              ariaLabel="Filtrar por dirección"
            />
          )}
          {filtroResultado && (
            <FiltroChips
              opciones={OPCIONES_RESULTADO}
              value={resultado}
              onChange={setResultado}
              ariaLabel="Filtrar por resultado"
            />
          )}
        </div>
      )}

      {filtradas.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          No hay operaciones que coincidan con el filtro.
        </p>
      ) : (
        <>
      <div className="flex flex-col gap-3 md:hidden">
        {visibles.map((trade) => (
          <div key={trade.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{trade.activo}</p>
                <p className="text-xs text-foreground-muted">
                  {trade.divisa} · {trade.fechaEntrada}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {trade.resultadoPnl === undefined ? (
                  <span className="text-sm text-foreground-muted">—</span>
                ) : (
                  <span
                    className={`text-sm font-semibold ${
                      trade.resultadoPnl >= 0 ? "text-risk-green" : "text-risk-red"
                    }`}
                  >
                    {formatMonto(trade.resultadoPnl, trade.divisa)}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-xs">
              <p className="text-foreground-muted">
                Tipo{" "}
                <span className="block capitalize text-foreground">
                  {trade.tipoOperacion}
                </span>
              </p>
              <p className="text-foreground-muted">
                Entrada{" "}
                <span className="block text-foreground">{trade.precioEntrada}</span>
              </p>
              <p className="text-foreground-muted">
                Stop Loss{" "}
                <span className="block text-foreground">
                  {trade.precioStopLoss ?? "—"}
                </span>
              </p>
              <p className="text-foreground-muted">
                Take Profit{" "}
                <span className="block text-foreground">
                  {trade.precioTakeProfit ?? "—"}
                </span>
              </p>
              <p className="col-span-2 text-foreground-muted">
                R:R{" "}
                <span
                  className={`ml-1 inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${rrBadgeClass(
                    trade.ratioRiesgoBeneficio
                  )}`}
                >
                  {trade.ratioRiesgoBeneficio === undefined
                    ? "—"
                    : `1 : ${trade.ratioRiesgoBeneficio.toFixed(2)}`}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground-muted">
              <th className="px-4 py-3 font-medium">Activo</th>
              <th className="px-4 py-3 font-medium">Divisa</th>
              <th className="px-4 py-3 font-medium">P&L</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Fecha entrada</th>
              <th className="px-4 py-3 font-medium">Entrada</th>
              <th className="px-4 py-3 font-medium">Stop Loss</th>
              <th className="px-4 py-3 font-medium">Take Profit</th>
              <th className="px-4 py-3 font-medium">R:R</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((trade) => (
              <tr key={trade.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">
                  {trade.activo}
                </td>
                <td className="px-4 py-3 text-foreground-muted">
                  {trade.divisa}
                </td>
                <td className="px-4 py-3 font-medium">
                  {trade.resultadoPnl === undefined ? (
                    <span className="text-foreground-muted">—</span>
                  ) : (
                    <span
                      className={
                        trade.resultadoPnl >= 0 ? "text-risk-green" : "text-risk-red"
                      }
                    >
                      {formatMonto(trade.resultadoPnl, trade.divisa)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 capitalize text-foreground-muted">
                  {trade.tipoOperacion}
                </td>
                <td className="px-4 py-3 text-foreground-muted">
                  {trade.fechaEntrada}
                </td>
                <td className="px-4 py-3 text-foreground-muted">
                  {trade.precioEntrada}
                </td>
                <td className="px-4 py-3 text-foreground-muted">
                  {trade.precioStopLoss ?? "—"}
                </td>
                <td className="px-4 py-3 text-foreground-muted">
                  {trade.precioTakeProfit ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${rrBadgeClass(
                      trade.ratioRiesgoBeneficio
                    )}`}
                  >
                    {trade.ratioRiesgoBeneficio === undefined
                      ? "—"
                      : `1 : ${trade.ratioRiesgoBeneficio.toFixed(2)}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ControlesListaPaginada
        visiblesCount={visibles.length}
        totalCount={totalCount}
        mostrarVerMas={mostrarVerMas}
        mostrarMinimizar={mostrarMinimizar}
        mostrarPaginador={mostrarPaginador}
        pagina={pagina}
        totalPaginas={totalPaginas}
        verMas={verMas}
        colapsar={colapsar}
        irAPagina={irAPagina}
      />
        </>
      )}
    </div>
  );
}

function TablaPlazosFijos() {
  const { plazosFijos, loading, error, liquidarPlazoFijo } = usePlazosFijos();
  const { refrescar } = useCuentas();
  const [liquidandoId, setLiquidandoId] = useState<string | null>(null);
  const [moneda, setMoneda] = useState<FiltroMoneda>("todas");

  const vencidos = plazosFijos
    .filter((pf) => plazoFijoVencido(pf.fechaVencimiento))
    .sort((a, b) => b.fechaVencimiento.localeCompare(a.fechaVencimiento));

  const filtrados =
    moneda === "todas" ? vencidos : vencidos.filter((pf) => pf.divisa === moneda);

  const {
    visibles,
    totalCount,
    mostrarVerMas,
    mostrarMinimizar,
    mostrarPaginador,
    pagina,
    totalPaginas,
    verMas,
    colapsar,
    irAPagina,
  } = useListaPaginada(filtrados, { conMinimizar: true });

  const liquidar = async (id: string) => {
    setLiquidandoId(id);
    try {
      await liquidarPlazoFijo(id);
      await refrescar();
    } finally {
      setLiquidandoId(null);
    }
  };

  if (error) {
    return (
      <div className="rounded-lg border border-risk-red-border bg-risk-red-bg p-4 text-sm text-risk-red">
        {error}
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-foreground-muted">Cargando plazos fijos...</p>;
  }

  if (vencidos.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        Todavía no hay plazos fijos vencidos. Los plazos fijos en curso
        aparecen en Posiciones Abiertas hasta su fecha de vencimiento.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <FiltroChips
        opciones={OPCIONES_MONEDA}
        value={moneda}
        onChange={setMoneda}
        ariaLabel="Filtrar por moneda"
      />

      {filtrados.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          No hay plazos fijos vencidos en {moneda}.
        </p>
      ) : (
        <>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground-muted">
              <th className="px-4 py-3 font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">TNA</th>
              <th className="px-4 py-3 font-medium">Plazo</th>
              <th className="px-4 py-3 font-medium">Fecha inicio</th>
              <th className="px-4 py-3 font-medium">Vencimiento</th>
              <th className="px-4 py-3 font-medium">Interés estimado</th>
              <th className="px-4 py-3 font-medium">Total al vencimiento</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((pf) => (
              <tr key={pf.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">
                  {formatMonto(pf.monto, pf.divisa)}
                </td>
                <td className="px-4 py-3 text-foreground-muted">{pf.tasaTna}%</td>
                <td className="px-4 py-3 text-foreground-muted">{pf.plazoDias} días</td>
                <td className="px-4 py-3 text-foreground-muted">{pf.fechaInicio}</td>
                <td className="px-4 py-3 text-foreground-muted">
                  {pf.fechaVencimiento}
                </td>
                <td className="px-4 py-3 font-medium text-risk-green">
                  +{formatMonto(pf.interesEstimado, pf.divisa)}
                </td>
                <td className="px-4 py-3 font-medium text-foreground">
                  {formatMonto(pf.monto + pf.interesEstimado, pf.divisa)}
                </td>
                <td className="px-4 py-3 text-right">
                  {pf.estado === "liquidado" ? (
                    <span className="rounded-full bg-risk-green-bg px-2 py-0.5 text-xs font-medium text-risk-green">
                      Liquidado
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => liquidar(pf.id)}
                      disabled={liquidandoId === pf.id}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted disabled:opacity-60"
                    >
                      {liquidandoId === pf.id ? "Liquidando..." : "Liquidar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ControlesListaPaginada
        visiblesCount={visibles.length}
        totalCount={totalCount}
        mostrarVerMas={mostrarVerMas}
        mostrarMinimizar={mostrarMinimizar}
        mostrarPaginador={mostrarPaginador}
        pagina={pagina}
        totalPaginas={totalPaginas}
        verMas={verMas}
        colapsar={colapsar}
        irAPagina={irAPagina}
      />
        </>
      )}
    </div>
  );
}

function GraficoPorDivisa({
  divisa,
  subTipoActivo,
  titulo,
  desdeEfectivo,
  hastaEfectivo,
}: {
  divisa: Divisa;
  subTipoActivo?: SubTipoCrypto;
  titulo: string;
  desdeEfectivo: string | null;
  hastaEfectivo: string | null;
}) {
  const { trades } = useTrades();

  const curva = trades
    .filter((t) => {
      if (t.divisa !== divisa || t.estado !== "cerrada" || t.resultadoPnl === undefined)
        return false;
      if (subTipoActivo !== undefined && t.subTipoActivo !== subTipoActivo) return false;
      const fecha = t.fechaSalida ?? "";
      if (desdeEfectivo && fecha < desdeEfectivo) return false;
      if (hastaEfectivo && fecha > hastaEfectivo) return false;
      return true;
    })
    .sort((a, b) => (a.fechaSalida ?? "").localeCompare(b.fechaSalida ?? ""))
    .reduce<{ fecha: string; valor: number }[]>((acc, t) => {
      const anterior = acc.length > 0 ? acc[acc.length - 1].valor : 0;
      acc.push({ fecha: t.fechaSalida ?? "", valor: anterior + (t.resultadoPnl ?? 0) });
      return acc;
    }, []);

  const total = curva.length > 0 ? curva[curva.length - 1].valor : 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
        <span
          className={`text-sm font-semibold ${
            total >= 0 ? "text-risk-green" : "text-risk-red"
          }`}
        >
          {formatMonto(total, divisa)}
        </span>
      </div>
      <EquityCurve puntos={curva} formatValor={(valor) => formatMonto(valor, divisa)} />
    </div>
  );
}

function GraficosPorDivisaSection() {
  const filtro = useFiltroFechaPreset();

  return (
    <div className="flex flex-col gap-6">
      <SelectorFechaPreset
        preset={filtro.preset}
        setPreset={filtro.setPreset}
        desde={filtro.desde}
        setDesde={filtro.setDesde}
        hasta={filtro.hasta}
        setHasta={filtro.setHasta}
      />
      <GraficoPorDivisa
        divisa="USDT"
        subTipoActivo="spot"
        titulo="P&L Crypto Spot"
        desdeEfectivo={filtro.desdeEfectivo}
        hastaEfectivo={filtro.hastaEfectivo}
      />
      <GraficoPorDivisa
        divisa="USDT"
        subTipoActivo="futuros"
        titulo="P&L Crypto Futuros"
        desdeEfectivo={filtro.desdeEfectivo}
        hastaEfectivo={filtro.hastaEfectivo}
      />
      <GraficoPorDivisa
        divisa="USD"
        titulo="P&L en USD"
        desdeEfectivo={filtro.desdeEfectivo}
        hastaEfectivo={filtro.hastaEfectivo}
      />
      <GraficoPorDivisa
        divisa="ARS"
        titulo="P&L en ARS"
        desdeEfectivo={filtro.desdeEfectivo}
        hastaEfectivo={filtro.hastaEfectivo}
      />
    </div>
  );
}

export default function HistorialPage() {
  const [tab, setTab] = useState<TabId>("acciones");
  const { trades } = useTrades();
  const { plazosFijos } = usePlazosFijos();

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-4 text-lg font-semibold text-foreground">
        Historial de operaciones
      </h1>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-brand text-foreground"
                : "border-transparent text-foreground-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "acciones" && (
        <TablaOperacionesCerradas
          key="acciones"
          tipoActivo="acciones"
          subTipoActivo="usd"
          mensajeVacio="No tiene operaciones cerradas de Acciones en el historial."
          filtroResultado
        />
      )}
      {tab === "cedears" && (
        <TablaOperacionesCerradas
          key="cedears"
          tipoActivo="acciones"
          subTipoActivo="cedear"
          mensajeVacio="No tiene operaciones cerradas de CEDEARs en el historial."
          filtroResultado
        />
      )}
      {tab === "crypto-futuros" && (
        <TablaOperacionesCerradas
          key="crypto-futuros"
          tipoActivo="crypto"
          subTipoActivo="futuros"
          mensajeVacio="No tiene operaciones cerradas de Cripto futuros en el historial."
          filtroResultado
          filtroDireccion
        />
      )}
      {tab === "crypto-spot" && (
        <TablaOperacionesCerradas
          key="crypto-spot"
          tipoActivo="crypto"
          subTipoActivo="spot"
          mensajeVacio="No tiene operaciones cerradas de Cripto spot en el historial."
          filtroResultado
        />
      )}
      {tab === "plazos-fijos" && <TablaPlazosFijos />}
      {tab === "graficos" && <GraficosPorDivisaSection />}
      {tab === "importar" && (
        <div className="flex flex-col gap-6">
          <ExportarPanel trades={trades} plazosFijos={plazosFijos} />
          <ImportarPanel />
        </div>
      )}
    </div>
  );
}
