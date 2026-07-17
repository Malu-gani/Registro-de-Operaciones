"use client";

import { useState } from "react";
import { usePortafolios } from "@/context/PortafoliosContext";
import { inputClasses, labelClasses } from "@/components/formStyles";
import type { TipoMercadoPortafolio } from "@/types/trading";

export default function CrearPortafolioModal({ onClose }: { onClose: () => void }) {
  const { crearPortafolio, setPortafolioActivoId } = usePortafolios();
  const [nombre, setNombre] = useState("");
  const [tipoMercado, setTipoMercado] = useState<TipoMercadoPortafolio>("mixto");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const nuevo = await crearPortafolio(nombre.trim(), tipoMercado);
      setPortafolioActivoId(nuevo.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el portafolio.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-lg">
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          Nuevo portafolio
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Nombre</span>
            <input
              autoFocus
              className={inputClasses}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Cuenta USA"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Tipo de mercado</span>
            <select
              className={inputClasses}
              value={tipoMercado}
              onChange={(e) =>
                setTipoMercado(e.target.value as TipoMercadoPortafolio)
              }
            >
              <option value="mixto">Mixto</option>
              <option value="acciones">Acciones</option>
              <option value="cripto">Cripto</option>
            </select>
            <span className="text-xs text-foreground-muted">
              {tipoMercado === "acciones"
                ? "Solo cuentas en Pesos (ARS) y Dólares (USD); operaciones de acciones/CEDEARs y plazos fijos."
                : tipoMercado === "cripto"
                  ? "Solo billeteras USDT (Spot y Futuros); operaciones de cripto."
                  : "Todas las cuentas y todos los tipos de operación."}
            </span>
          </label>

          {error && <p className="text-xs text-risk-red">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:bg-surface-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando || !nombre.trim()}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
            >
              {guardando ? "Creando..." : "Crear portafolio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
