"use client";

import { useState } from "react";
import { signOut } from "@/app/actions";
import { TODOS_LOS_PORTAFOLIOS, usePortafolios } from "@/context/PortafoliosContext";
import { inputClasses, labelClasses } from "@/components/formStyles";
import type { TipoMercadoPortafolio } from "@/types/trading";

const CREAR_PORTAFOLIO = "__crear__";

function CrearPortafolioModal({ onClose }: { onClose: () => void }) {
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
            <span className={labelClasses}>Tipo de mercado (informativo)</span>
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

export default function Navbar({ userEmail }: { userEmail: string }) {
  const { portafolios, portafolioActivoId, setPortafolioActivoId } =
    usePortafolios();
  const [mostrarModal, setMostrarModal] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === CREAR_PORTAFOLIO) {
      setMostrarModal(true);
      return;
    }
    setPortafolioActivoId(e.target.value);
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-6">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-semibold text-brand-foreground">
          T
        </span>
        <span className="text-sm font-semibold text-foreground">
          Diario de Trading
        </span>
      </div>

      <div className="flex items-center gap-4">
        <select
          value={portafolioActivoId}
          onChange={handleChange}
          className="rounded-md border border-border bg-surface-muted px-3 py-1.5 text-sm text-foreground outline-none"
        >
          <option value={TODOS_LOS_PORTAFOLIOS}>Todos los portafolios</option>
          {portafolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
          <option value={CREAR_PORTAFOLIO}>+ Crear portafolio...</option>
        </select>

        <span className="text-xs text-foreground-muted">{userEmail}</span>

        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:bg-surface-muted"
          >
            Salir
          </button>
        </form>
      </div>

      {mostrarModal && (
        <CrearPortafolioModal onClose={() => setMostrarModal(false)} />
      )}
    </header>
  );
}
