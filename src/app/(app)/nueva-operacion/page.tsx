"use client";

import { useState } from "react";
import AccionesForm from "@/components/forms/AccionesForm";
import CryptoForm from "@/components/forms/CryptoForm";
import PlazoFijoForm from "@/components/forms/PlazoFijoForm";
import { TODOS_LOS_PORTAFOLIOS, usePortafolios } from "@/context/PortafoliosContext";
import { operacionesDeMercado } from "@/utils/tipoMercado";

const tabs = [
  { id: "acciones", label: "Acciones" },
  { id: "crypto", label: "Cripto" },
  { id: "plazo-fijo", label: "Plazo fijo" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function NuevaOperacionPage() {
  const { portafolios, portafolioActivoId } = usePortafolios();
  const [tab, setTab] = useState<TabId>("acciones");

  // Con un portafolio específico activo, solo mostramos las pestañas que su
  // tipo de mercado admite. Con "Todos" activo no sabemos el destino hasta que
  // se elige dentro del formulario, así que mostramos todas (el propio form
  // valida al guardar).
  const tipoMercadoActivo =
    portafolioActivoId !== TODOS_LOS_PORTAFOLIOS
      ? portafolios.find((p) => p.id === portafolioActivoId)?.tipoMercado
      : undefined;

  const tabsVisibles = tipoMercadoActivo
    ? tabs.filter((t) => operacionesDeMercado(tipoMercadoActivo).includes(t.id))
    : tabs;

  // Pestaña efectiva: si la seleccionada no está permitida por el portafolio
  // activo (o cambió el portafolio), usamos la primera visible. Derivado en
  // vez de un effect para no re-renderizar ni desincronizar el estado.
  const tabActiva = tabsVisibles.some((t) => t.id === tab)
    ? tab
    : tabsVisibles[0]?.id;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap gap-2 border-b border-border">
        {tabsVisibles.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tabActiva === t.id
                ? "border-brand text-foreground"
                : "border-transparent text-foreground-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabActiva === "acciones" && <AccionesForm />}
      {tabActiva === "crypto" && <CryptoForm />}
      {tabActiva === "plazo-fijo" && <PlazoFijoForm />}
    </div>
  );
}
