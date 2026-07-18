"use client";

import { useState } from "react";
import { usePreferencias } from "@/context/PreferenciasContext";
import type { Tema } from "@/lib/preferenciasApi";
import SeccionAjustes from "./SeccionAjustes";

const OPCIONES: { valor: Tema; label: string; ayuda: string }[] = [
  { valor: "auto", label: "Automático", ayuda: "Sigue tu sistema" },
  { valor: "claro", label: "Claro", ayuda: "Siempre claro" },
  { valor: "oscuro", label: "Oscuro", ayuda: "Siempre oscuro" },
];

export default function SeccionTema() {
  const { tema, setTema, loading } = usePreferencias();
  const [error, setError] = useState<string | null>(null);

  const elegir = async (valor: Tema) => {
    if (valor === tema) return;
    setError(null);
    try {
      await setTema(valor);
    } catch {
      setError("No se pudo guardar el tema. Reintentá.");
    }
  };

  return (
    <SeccionAjustes
      titulo="Tema"
      descripcion="Se guarda en tu cuenta y te sigue en cualquier dispositivo."
    >
      <div className="flex flex-wrap gap-2">
        {OPCIONES.map((o) => {
          const activo = tema === o.valor;
          return (
            <button
              key={o.valor}
              type="button"
              onClick={() => elegir(o.valor)}
              disabled={loading}
              aria-pressed={activo}
              className={`flex flex-1 flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                activo
                  ? "border-brand bg-brand/10"
                  : "border-border bg-surface hover:bg-surface-muted"
              }`}
            >
              <span className="text-sm font-medium text-foreground">{o.label}</span>
              <span className="text-xs text-foreground-muted">{o.ayuda}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-risk-red">{error}</p>}
    </SeccionAjustes>
  );
}
