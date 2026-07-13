"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTrades } from "@/context/TradesContext";
import EquityCurve from "@/components/EquityCurve";
import type { Trade } from "@/types/trading";

type Categoria = "acciones" | "cedears" | "spot" | "futuros";
type Preset = "1m" | "2m" | "6m" | "1a" | "custom";

const categorias: { id: Categoria; label: string; moneda: string }[] = [
  { id: "acciones", label: "Acciones", moneda: "USD" },
  { id: "cedears", label: "CEDEARs", moneda: "ARS" },
  { id: "spot", label: "Cripto spot", moneda: "USDT" },
  { id: "futuros", label: "Cripto futuros", moneda: "USDT" },
];

/** Pestaña de Posiciones Abiertas que corresponde a cada categoría del Resumen. */
const tabPosiciones: Record<Categoria, string> = {
  acciones: "acciones",
  cedears: "cedears",
  spot: "crypto-spot",
  futuros: "crypto-futuros",
};

const presets: { id: Preset; label: string }[] = [
  { id: "1m", label: "Último mes" },
  { id: "2m", label: "2 meses" },
  { id: "6m", label: "6 meses" },
  { id: "1a", label: "1 año" },
  { id: "custom", label: "Personalizado" },
];

/**
 * Formateador de moneda por categoría. Cada categoría tiene una sola moneda
 * natural, así que el P&L se muestra en su divisa real en vez de forzar USD.
 * USDT no es una moneda ISO válida para Intl, así que se formatea como número
 * con el sufijo " USDT".
 */
function formatearMoneda(valor: number, moneda: string): string {
  if (moneda === "USDT") {
    const n = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(
      valor
    );
    return `${n} USDT`;
  }
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: 2,
  }).format(valor);
}

function coincideCategoria(t: Trade, categoria: Categoria): boolean {
  switch (categoria) {
    case "acciones":
      return t.tipoActivo === "acciones" && t.subTipoActivo === "usd";
    case "cedears":
      return t.tipoActivo === "acciones" && t.subTipoActivo === "cedear";
    case "spot":
      return t.tipoActivo === "crypto" && t.subTipoActivo === "spot";
    case "futuros":
      return t.tipoActivo === "crypto" && t.subTipoActivo === "futuros";
  }
}

/** Devuelve la fecha "desde" (YYYY-MM-DD) para un preset, o null si es custom. */
function fechaDesdePreset(preset: Preset): string | null {
  if (preset === "custom") return null;
  const meses = { "1m": 1, "2m": 2, "6m": 6, "1a": 12 }[preset];
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
}

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
    <div className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p
        className={`mt-1 break-words text-xl font-semibold leading-tight tabular-nums sm:text-2xl ${toneClass}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const { trades, loading, error } = useTrades();

  const [categoria, setCategoria] = useState<Categoria>("acciones");
  const [preset, setPreset] = useState<Preset>("6m");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const moneda =
    categorias.find((c) => c.id === categoria)?.moneda ?? "USD";

  const abiertas = useMemo(
    () => trades.filter((t) => t.estado === "abierta"),
    [trades]
  );

  // Operaciones cerradas de la categoría activa, dentro del rango de fechas.
  const cerradas = useMemo(() => {
    const desdeEfectivo =
      preset === "custom" ? (desde || null) : fechaDesdePreset(preset);
    const hastaEfectivo = preset === "custom" ? hasta || null : null;

    return trades.filter((t) => {
      if (t.estado !== "cerrada" || t.resultadoPnl === undefined) return false;
      if (!coincideCategoria(t, categoria)) return false;
      const fecha = t.fechaSalida ?? "";
      if (desdeEfectivo && fecha < desdeEfectivo) return false;
      if (hastaEfectivo && fecha > hastaEfectivo) return false;
      return true;
    });
  }, [trades, categoria, preset, desde, hasta]);

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
        Resumen de rendimiento
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
      {/* Switch de categoría */}
      <div className="flex flex-wrap gap-2 border-b border-border">
        {categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategoria(c.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              categoria === c.id
                ? "border-brand text-foreground"
                : "border-transparent text-foreground-muted hover:text-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Filtro temporal */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                preset === p.id
                  ? "border-brand bg-brand/10 text-foreground"
                  : "border-border text-foreground-muted hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-foreground-muted">
              Desde
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-foreground-muted">
              Hasta
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>
        )}
      </div>

      {cerradas.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-foreground-muted">
          No hay operaciones cerradas de esta categoría en el período
          seleccionado.
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Tasa de acierto" value={`${winRate.toFixed(0)}%`} />
        <KpiCard
          label={`P&L acumulado (${moneda})`}
          value={`${pnlAcumulado >= 0 ? "+" : ""}${formatearMoneda(pnlAcumulado, moneda)}`}
          tone={pnlAcumulado >= 0 ? "positive" : "negative"}
        />
        <KpiCard label="Operaciones cerradas" value={`${cerradas.length}`} />
        <KpiCard label="R:R promedio" value={`1 : ${rrPromedio.toFixed(2)}`} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          Evolución del P&L acumulado ({moneda})
        </h2>
        <EquityCurve
          puntos={curva}
          formatValor={(valor) => formatearMoneda(valor, moneda)}
        />
      </div>
      </>
      )}

      {abiertas.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Operaciones abiertas
          </h2>
          <p className="text-sm text-foreground-muted">
            Tiene {abiertas.length}{" "}
            {abiertas.length === 1 ? "operación abierta" : "operaciones abiertas"}.
            Puede dirigirse a{" "}
            <Link
              href={`/posiciones-abiertas?tab=${tabPosiciones[categoria]}`}
              className="text-brand underline"
            >
              Posiciones Abiertas
            </Link>{" "}
            para {abiertas.length === 1 ? "visualizarla" : "visualizarlas"} en
            detalle.
          </p>
        </div>
      )}
      </>
      )}
    </div>
  );
}
