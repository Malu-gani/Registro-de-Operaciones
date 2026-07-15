"use client";

import { useState } from "react";

export type PresetFecha = "1m" | "2m" | "6m" | "1a" | "custom";

const presets: { id: PresetFecha; label: string }[] = [
  { id: "1m", label: "Último mes" },
  { id: "2m", label: "2 meses" },
  { id: "6m", label: "6 meses" },
  { id: "1a", label: "1 año" },
  { id: "custom", label: "Personalizado" },
];

/** Devuelve la fecha "desde" (YYYY-MM-DD) para un preset, o null si es custom. */
function fechaDesdePreset(preset: PresetFecha): string | null {
  if (preset === "custom") return null;
  const meses = { "1m": 1, "2m": 2, "6m": 6, "1a": 12 }[preset];
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
}

interface FiltroFechaPreset {
  preset: PresetFecha;
  setPreset: (p: PresetFecha) => void;
  desde: string;
  setDesde: (v: string) => void;
  hasta: string;
  setHasta: (v: string) => void;
  /** Fecha "desde" ya resuelta (según preset o custom), o null si no aplica corte. */
  desdeEfectivo: string | null;
  /** Fecha "hasta" ya resuelta (solo custom), o null si no aplica corte. */
  hastaEfectivo: string | null;
}

/** Filtro de rango de fechas por preset (último mes/2 meses/6 meses/1 año) o rango custom. */
export function useFiltroFechaPreset(presetInicial: PresetFecha = "6m"): FiltroFechaPreset {
  const [preset, setPreset] = useState<PresetFecha>(presetInicial);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const desdeEfectivo = preset === "custom" ? desde || null : fechaDesdePreset(preset);
  const hastaEfectivo = preset === "custom" ? hasta || null : null;

  return { preset, setPreset, desde, setDesde, hasta, setHasta, desdeEfectivo, hastaEfectivo };
}

/** UI de botones de preset + inputs de fecha (si el preset activo es "custom"). */
export function SelectorFechaPreset({
  preset,
  setPreset,
  desde,
  setDesde,
  hasta,
  setHasta,
}: Pick<FiltroFechaPreset, "preset" | "setPreset" | "desde" | "setDesde" | "hasta" | "setHasta">) {
  return (
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
  );
}
