"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { PlazoFijo } from "@/types/trading";
import { fetchPlazosFijos, insertPlazoFijo } from "@/lib/plazosFijosApi";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { TODOS_LOS_PORTAFOLIOS, usePortafolios } from "./PortafoliosContext";

interface PlazosFijosContextValue {
  plazosFijos: PlazoFijo[];
  loading: boolean;
  error: string | null;
  addPlazoFijo: (
    plazoFijo: Omit<PlazoFijo, "id" | "portafolioId">,
    portafolioId?: string
  ) => Promise<void>;
}

const PlazosFijosContext = createContext<PlazosFijosContextValue | null>(null);

export function PlazosFijosProvider({ children }: { children: React.ReactNode }) {
  const { portafolioActivoId } = usePortafolios();
  const [plazosFijos, setPlazosFijos] = useState<PlazoFijo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(
        "Supabase no está configurado. Completá .env.local con NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY y reiniciá el servidor (npm run dev)."
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    const portafolioId =
      portafolioActivoId === TODOS_LOS_PORTAFOLIOS ? undefined : portafolioActivoId;

    fetchPlazosFijos(portafolioId)
      .then(setPlazosFijos)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Error al cargar plazos fijos")
      )
      .finally(() => setLoading(false));
  }, [portafolioActivoId]);

  const addPlazoFijo = async (
    plazoFijo: Omit<PlazoFijo, "id" | "portafolioId">,
    portafolioId?: string
  ) => {
    const idEfectivo =
      portafolioId ??
      (portafolioActivoId !== TODOS_LOS_PORTAFOLIOS ? portafolioActivoId : undefined);
    if (!idEfectivo) {
      throw new Error("Elegí en qué portafolio guardar el plazo fijo.");
    }
    const nuevo = await insertPlazoFijo(plazoFijo, idEfectivo);
    setPlazosFijos((prev) => [nuevo, ...prev]);
  };

  return (
    <PlazosFijosContext.Provider
      value={{ plazosFijos, loading, error, addPlazoFijo }}
    >
      {children}
    </PlazosFijosContext.Provider>
  );
}

export function usePlazosFijos() {
  const ctx = useContext(PlazosFijosContext);
  if (!ctx) {
    throw new Error("usePlazosFijos debe usarse dentro de PlazosFijosProvider");
  }
  return ctx;
}
