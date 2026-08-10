"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTrades } from "@/context/TradesContext";
import { usePlazosFijos } from "@/context/PlazosFijosContext";
import { fechaISOLocal } from "@/utils/riskCalculations";
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
  return fechaISOLocal(d);
}

function KpiCard({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-risk-green"
      : tone === "negative"
        ? "text-risk-red"
        : "text-foreground";

  return (
    <div className="card-hover flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        {icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            {icon}
          </span>
        )}
        <p className="min-w-0 truncate text-xs text-foreground-muted">{label}</p>
      </div>
      <p
        className={`mt-2 break-words text-xl font-semibold leading-tight tabular-nums sm:text-2xl ${toneClass}`}
      >
        {value}
      </p>
    </div>
  );
}

/** Íconos inline (stroke = currentColor) para las KPI cards. */
const iconos = {
  acierto: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  operaciones: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m7 14 3-3 3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ratio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

/**
 * Sección independiente de Plazos Fijos en el Resumen. Los plazos no tienen
 * P&L / win rate / R:R como las operaciones, así que no entran en el switch de
 * categorías: se muestran aparte, agregados por divisa (ARS / USD). "Activos" =
 * todavía no liquidados (el capital sigue colocado, aunque el plazo ya venza).
 */
function SeccionPlazosFijos() {
  const { plazosFijos, loading, error } = usePlazosFijos();

  if (loading || error) return null;

  const activos = plazosFijos.filter((pf) => pf.estado !== "liquidado");

  if (activos.length === 0) {
    return (
      <div className="card-hover rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Plazos fijos</h2>
        <p className="text-sm text-foreground-muted">
          No tiene plazos fijos activos en este portafolio.
        </p>
      </div>
    );
  }

  const resumen = (["ARS", "USD"] as const)
    .map((divisa) => {
      const items = activos.filter((pf) => pf.divisa === divisa);
      return {
        divisa,
        cantidad: items.length,
        capital: items.reduce((acc, pf) => acc + pf.monto, 0),
        interes: items.reduce((acc, pf) => acc + pf.interesEstimado, 0),
      };
    })
    .filter((r) => r.cantidad > 0);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">Plazos fijos activos</h2>
      {resumen.map((r) => (
        <div key={r.divisa} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground-muted">
              {r.divisa}
            </span>
            <span className="text-xs text-foreground-muted">
              {r.cantidad} {r.cantidad === 1 ? "plazo activo" : "plazos activos"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <KpiCard
              label={`Capital colocado (${r.divisa})`}
              value={formatearMoneda(r.capital, r.divisa)}
            />
            <KpiCard
              label={`Interés proyectado (${r.divisa})`}
              value={`+${formatearMoneda(r.interes, r.divisa)}`}
              tone="positive"
            />
            <KpiCard
              label={`Total al vencimiento (${r.divisa})`}
              value={formatearMoneda(r.capital + r.interes, r.divisa)}
            />
          </div>
        </div>
      ))}
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
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
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
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                preset === p.id
                  ? "border-brand bg-brand/10 text-foreground"
                  : "border-border text-foreground-muted hover:border-brand/40 hover:text-foreground"
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
      {/* Tarjeta destacada: P&L acumulado del período. */}
      <div className="hero-gradient relative flex flex-col gap-4 overflow-hidden rounded-2xl p-6 sm:p-7">
        <div className="flex items-center gap-2 text-sm font-medium opacity-80">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/15">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m19 9-5 5-4-4-3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          P&L acumulado ({moneda})
        </div>
        <p className="break-words text-3xl font-bold leading-none tabular-nums sm:text-4xl">
          {pnlAcumulado >= 0 ? "+" : ""}
          {formatearMoneda(pnlAcumulado, moneda)}
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
            Tasa de acierto {winRate.toFixed(0)}%
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
            {cerradas.length}{" "}
            {cerradas.length === 1 ? "operación" : "operaciones"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Tasa de acierto"
          value={`${winRate.toFixed(0)}%`}
          icon={iconos.acierto}
        />
        <KpiCard
          label="Operaciones cerradas"
          value={`${cerradas.length}`}
          icon={iconos.operaciones}
        />
        <KpiCard
          label="R:R promedio"
          value={`1 : ${rrPromedio.toFixed(2)}`}
          icon={iconos.ratio}
        />
      </div>

      <div className="card-hover rounded-xl border border-border bg-surface p-6">
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
        <div className="card-hover rounded-xl border border-border bg-surface p-6">
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

      <SeccionPlazosFijos />
      </>
      )}
    </div>
  );
}
