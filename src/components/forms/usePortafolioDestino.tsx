"use client";

import { useState } from "react";
import { TODOS_LOS_PORTAFOLIOS, usePortafolios } from "@/context/PortafoliosContext";
import { inputClasses, labelClasses } from "../formStyles";

/**
 * Con "Todos los portafolios" activo en el Navbar, los formularios de carga
 * no tienen un portafolio implícito: hay que pedirlo. `selectorField` es
 * null cuando hay un portafolio activo concreto (no hace falta elegir).
 */
export function usePortafolioDestino() {
  const { portafolios, portafolioActivoId } = usePortafolios();
  const [seleccionado, setSeleccionado] = useState("");

  const requiereSeleccion = portafolioActivoId === TODOS_LOS_PORTAFOLIOS;
  const portafolioId = requiereSeleccion ? seleccionado || undefined : portafolioActivoId;

  const selectorField = requiereSeleccion ? (
    <label className="col-span-2 flex flex-col gap-1">
      <span className={labelClasses}>Portafolio</span>
      <select
        className={inputClasses}
        value={seleccionado}
        onChange={(e) => setSeleccionado(e.target.value)}
      >
        <option value="">Elegí un portafolio...</option>
        {portafolios.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
    </label>
  ) : null;

  return { portafolioId, selectorField };
}
