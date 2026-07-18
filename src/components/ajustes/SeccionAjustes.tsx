"use client";

import { useState } from "react";

/**
 * Contenedor visual de una sección de Ajustes: título, descripción opcional y
 * cuerpo dentro de una tarjeta colapsable. Arranca cerrada para que la pestaña
 * no muestre todo de una (menos invasiva); el título es un botón que despliega.
 * `tono="peligro"` tiñe borde/título de rojo (para Eliminar cuenta).
 */
export default function SeccionAjustes({
  titulo,
  descripcion,
  tono = "normal",
  children,
}: {
  titulo: string;
  descripcion?: string;
  tono?: "normal" | "peligro";
  children: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);
  const peligro = tono === "peligro";

  return (
    <section
      className={`flex flex-col rounded-xl border bg-surface ${
        peligro ? "border-risk-red-border" : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex items-center justify-between gap-3 p-6 text-left"
      >
        <div className="flex flex-col gap-1">
          <h2
            className={`text-sm font-semibold ${
              peligro ? "text-risk-red" : "text-foreground"
            }`}
          >
            {titulo}
          </h2>
          {descripcion && (
            <p className="text-xs text-foreground-muted">{descripcion}</p>
          )}
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-5 w-5 shrink-0 text-foreground-muted transition-transform ${
            abierta ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {abierta && (
        <div className="flex flex-col gap-4 px-6 pb-6">{children}</div>
      )}
    </section>
  );
}
