"use client";

import { useState } from "react";
import { useTrades } from "@/context/TradesContext";
import { usePlazosFijos } from "@/context/PlazosFijosContext";
import { useCuentas } from "@/context/CuentasContext";
import { useListaPaginada, ControlesListaPaginada } from "@/components/ListaPaginada";
import { plazoFijoVencido } from "@/utils/riskCalculations";
import type { Divisa } from "@/types/trading";
import EquityCurve from "@/components/EquityCurve";

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
  { id: "operaciones", label: "Operaciones" },
  { id: "plazos-fijos", label: "Plazos Fijos" },
  { id: "graficos", label: "Gráficos P&L por divisa" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function TablaOperaciones() {
  const { trades, loading, error } = useTrades();

  const ordenadas = trades
    .filter((t) => t.estado === "cerrada")
    .sort((a, b) => b.fechaEntrada.localeCompare(a.fechaEntrada));

  const {
    visibles,
    totalCount,
    mostrarVerMas,
    mostrarPaginador,
    pagina,
    totalPaginas,
    verMas,
    irAPagina,
  } = useListaPaginada(ordenadas);

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
    return (
      <p className="text-sm text-foreground-muted">
        Todavía no hay operaciones cerradas.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
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
        mostrarPaginador={mostrarPaginador}
        pagina={pagina}
        totalPaginas={totalPaginas}
        verMas={verMas}
        irAPagina={irAPagina}
      />
    </div>
  );
}

function TablaPlazosFijos() {
  const { plazosFijos, loading, error, liquidarPlazoFijo } = usePlazosFijos();
  const { refrescar } = useCuentas();
  const [liquidandoId, setLiquidandoId] = useState<string | null>(null);

  const vencidos = plazosFijos
    .filter((pf) => plazoFijoVencido(pf.fechaVencimiento))
    .sort((a, b) => b.fechaVencimiento.localeCompare(a.fechaVencimiento));

  const {
    visibles,
    totalCount,
    mostrarVerMas,
    mostrarPaginador,
    pagina,
    totalPaginas,
    verMas,
    irAPagina,
  } = useListaPaginada(vencidos);

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
        mostrarPaginador={mostrarPaginador}
        pagina={pagina}
        totalPaginas={totalPaginas}
        verMas={verMas}
        irAPagina={irAPagina}
      />
    </div>
  );
}

function GraficoPorDivisa({ divisa }: { divisa: Divisa }) {
  const { trades } = useTrades();

  const curva = trades
    .filter(
      (t) =>
        t.divisa === divisa && t.estado === "cerrada" && t.resultadoPnl !== undefined
    )
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
        <h2 className="text-sm font-semibold text-foreground">P&L en {divisa}</h2>
        <span
          className={`text-sm font-semibold ${
            total >= 0 ? "text-risk-green" : "text-risk-red"
          }`}
        >
          {formatMonto(total, divisa)}
        </span>
      </div>
      <EquityCurve puntos={curva} />
    </div>
  );
}

export default function HistorialPage() {
  const [tab, setTab] = useState<TabId>("operaciones");

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

      {tab === "operaciones" && <TablaOperaciones />}
      {tab === "plazos-fijos" && <TablaPlazosFijos />}
      {tab === "graficos" && (
        <div className="flex flex-col gap-6">
          <GraficoPorDivisa divisa="USDT" />
          <GraficoPorDivisa divisa="USD" />
          <GraficoPorDivisa divisa="ARS" />
        </div>
      )}
    </div>
  );
}
