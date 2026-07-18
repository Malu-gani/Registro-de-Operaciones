"use client";

import { useState } from "react";
import { signOut } from "@/app/actions";
import { TODOS_LOS_PORTAFOLIOS, usePortafolios } from "@/context/PortafoliosContext";
import CrearPortafolioModal from "@/components/portafolio/CrearPortafolioModal";
import ToggleTema from "@/components/ajustes/ToggleTema";

const CREAR_PORTAFOLIO = "__crear__";

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
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="glow-ring flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-semibold text-brand-foreground">
          T
        </span>
        <span className="hidden text-sm font-semibold text-foreground sm:inline">
          Diario de Trading
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <select
          value={portafolioActivoId}
          onChange={handleChange}
          className="min-w-0 max-w-[45vw] rounded-md border border-border bg-surface-muted px-3 py-1.5 text-sm text-foreground outline-none transition-colors hover:border-brand/40 sm:max-w-none"
        >
          <option value={TODOS_LOS_PORTAFOLIOS}>Todos los portafolios</option>
          {portafolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
          <option value={CREAR_PORTAFOLIO}>+ Crear portafolio...</option>
        </select>

        <span
          title={userEmail}
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold uppercase text-brand sm:flex"
        >
          {(userEmail.trim()[0] ?? "?").toUpperCase()}
        </span>

        <ToggleTema />

        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-brand/40 hover:bg-surface-muted hover:text-foreground"
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
