"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { PlazoFijo } from "@/types/trading";
import {
  fetchPlazosFijos,
  insertPlazoFijo,
  liquidarPlazoFijo as liquidarPlazoFijoApi,
} from "@/lib/plazosFijosApi";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { TODOS_LOS_PORTAFOLIOS, usePortafolios } from "./PortafoliosContext";

interface PlazosFijosContextValue {
  plazosFijos: PlazoFijo[];
  loading: boolean;
  error: string | null;
  addPlazoFijo: (
    plazoFijo: Omit<PlazoFijo, "id" | "portafolioId" | "estado">,
    portafolioId?: string
  ) => Promise<void>;
  liquidarPlazoFijo: (id: string) => Promise<void>;
}

const PlazosFijosContext = createContext<PlazosFijosContextValue | null>(null);

export function PlazosFijosProvider({ children }: { children: React.ReactNode }) {
  const { portafolioActivoId } = usePortafolios();
  const [plazosFijos, setPlazosFijos] = useState<PlazoFijo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const portafolioId =
    portafolioActivoId === TODOS_LOS_PORTAFOLIOS ? undefined : portafolioActivoId;

  const cargar = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError(
        "Supabase no está configurado. Complete .env.local con NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY y reinicie el servidor (npm run dev)."
      );
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setPlazosFijos(await fetchPlazosFijos(portafolioId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar plazos fijos");
    } finally {
      setLoading(false);
    }
  }, [portafolioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const addPlazoFijo = async (
    plazoFijo: Omit<PlazoFijo, "id" | "portafolioId" | "estado">,
    portafolioIdArg?: string
  ) => {
    const idEfectivo = portafolioIdArg ?? portafolioId;
    if (!idEfectivo) {
      throw new Error("Elija en qué portafolio guardar el plazo fijo.");
    }
    const nuevo = await insertPlazoFijo(plazoFijo, idEfectivo);
    setPlazosFijos((prev) => [nuevo, ...prev]);
  };

  const liquidarPlazoFijo = async (id: string) => {
    await liquidarPlazoFijoApi(id);
    await cargar();
  };

  return (
    <PlazosFijosContext.Provider
      value={{ plazosFijos, loading, error, addPlazoFijo, liquidarPlazoFijo }}
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
