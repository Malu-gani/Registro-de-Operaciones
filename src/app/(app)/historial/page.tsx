"use client";

import { useState } from "react";
import { useTrades } from "@/context/TradesContext";
import { usePlazosFijos } from "@/context/PlazosFijosContext";
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
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-foreground-muted">
            <th className="px-4 py-3 font-medium">Activo</th>
            <th className="px-4 py-3 font-medium">Divisa</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 font-medium">Fecha entrada</th>
            <th className="px-4 py-3 font-medium">Entrada</th>
            <th className="px-4 py-3 font-medium">Stop Loss</th>
            <th className="px-4 py-3 font-medium">Take Profit</th>
            <th className="px-4 py-3 font-medium">R:R</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">P&L</th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((trade) => (
            <tr key={trade.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium text-foreground">
                {trade.activo}
              </td>
              <td className="px-4 py-3 text-foreground-muted">
                {trade.divisa}
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
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    trade.estado === "abierta"
                      ? "bg-surface-muted text-foreground-muted"
                      : "bg-risk-green-bg text-risk-green"
                  }`}
                >
                  {trade.estado}
                </span>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaPlazosFijos() {
  const { plazosFijos, loading, error } = usePlazosFijos();

  const vencidos = plazosFijos
    .filter((pf) => plazoFijoVencido(pf.fechaVencimiento))
    .sort((a, b) => b.fechaVencimiento.localeCompare(a.fechaVencimiento));

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
          </tr>
        </thead>
        <tbody>
          {vencidos.map((pf) => (
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
            </tr>
          ))}
        </tbody>
      </table>
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
        Historial
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
