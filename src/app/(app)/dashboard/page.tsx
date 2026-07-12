"use client";

import { useTrades } from "@/context/TradesContext";
import EquityCurve from "@/components/EquityCurve";

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function KpiCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-risk-green"
      : tone === "negative"
        ? "text-risk-red"
        : "text-foreground";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { trades, loading, error } = useTrades();

  const cerradas = trades.filter(
    (t) => t.estado === "cerrada" && t.resultadoPnl !== undefined
  );
  const abiertas = trades.filter((t) => t.estado === "abierta");

  const ganadoras = cerradas.filter((t) => (t.resultadoPnl ?? 0) > 0);
  const winRate =
    cerradas.length > 0 ? (ganadoras.length / cerradas.length) * 100 : 0;

  const pnlAcumulado = cerradas.reduce(
    (acc, t) => acc + (t.resultadoPnl ?? 0),
    0
  );

  const cerradasConRR = cerradas.filter(
    (t) => t.ratioRiesgoBeneficio !== undefined
  );
  const rrPromedio =
    cerradasConRR.length > 0
      ? cerradasConRR.reduce((acc, t) => acc + (t.ratioRiesgoBeneficio ?? 0), 0) /
        cerradasConRR.length
      : 0;

  const curva = cerradas
    .slice()
    .sort((a, b) => (a.fechaSalida ?? "").localeCompare(b.fechaSalida ?? ""))
    .reduce<{ fecha: string; valor: number }[]>((acc, t) => {
      const anterior = acc.length > 0 ? acc[acc.length - 1].valor : 0;
      acc.push({ fecha: t.fechaSalida ?? "", valor: anterior + (t.resultadoPnl ?? 0) });
      return acc;
    }, []);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">
        Resumen de Rendimiento
      </h1>

      {error && (
        <div className="rounded-lg border border-risk-red-border bg-risk-red-bg p-4 text-sm text-risk-red">
          {error}
        </div>
      )}

      {loading && !error && (
        <p className="text-sm text-foreground-muted">Cargando datos...</p>
      )}

      {!loading && !error && (
      <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Win rate" value={`${winRate.toFixed(0)}%`} />
        <KpiCard
          label="P&L acumulado"
          value={`${pnlAcumulado >= 0 ? "+" : ""}${currency.format(pnlAcumulado)}`}
          tone={pnlAcumulado >= 0 ? "positive" : "negative"}
        />
        <KpiCard label="Operaciones cerradas" value={`${cerradas.length}`} />
        <KpiCard label="R:R promedio" value={`1 : ${rrPromedio.toFixed(2)}`} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          Curva de Equity (P&L acumulado)
        </h2>
        <EquityCurve puntos={curva} />
      </div>

      {abiertas.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Operaciones abiertas
          </h2>
          <p className="text-sm text-foreground-muted">
            Tenés {abiertas.length} operación(es) abierta(s). Vas a{" "}
            <a href="/posiciones-abiertas" className="text-brand underline">
              Posiciones Abiertas
            </a>{" "}
            para verlas en detalle.
          </p>
        </div>
      )}
      </>
      )}
    </div>
  );
}
