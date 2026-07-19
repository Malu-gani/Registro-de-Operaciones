"use client";

export interface OpcionChip<T extends string> {
  value: T;
  label: string;
}

/**
 * Fila de botones-pill para filtrar una lista por una dimensión.
 * Presentacional puro: el estado del filtro lo maneja quien lo usa.
 * Mismo lenguaje visual que SelectorFechaPreset (border-brand bg-brand/10 activo).
 */
export function FiltroChips<T extends string>({
  opciones,
  value,
  onChange,
  ariaLabel,
}: {
  opciones: readonly OpcionChip<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {opciones.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
            value === o.value
              ? "border-brand bg-brand/10 text-foreground"
              : "border-border text-foreground-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
