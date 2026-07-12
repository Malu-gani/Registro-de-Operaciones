"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { MovimientoFuturos } from "@/types/trading";
import {
  fetchMovimientosFuturos,
  insertMovimientoFuturos,
} from "@/lib/movimientosFuturosApi";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { TODOS_LOS_PORTAFOLIOS, usePortafolios } from "./PortafoliosContext";

interface MovimientosFuturosContextValue {
  movimientos: MovimientoFuturos[];
  loading: boolean;
  error: string | null;
  addMovimiento: (
    movimiento: Omit<MovimientoFuturos, "id" | "portafolioId">,
    portafolioId?: string
  ) => Promise<void>;
}

const MovimientosFuturosContext =
  createContext<MovimientosFuturosContextValue | null>(null);

export function MovimientosFuturosProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { portafolioActivoId } = usePortafolios();
  const [movimientos, setMovimientos] = useState<MovimientoFuturos[]>([]);
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

    fetchMovimientosFuturos(portafolioId)
      .then(setMovimientos)
      .catch((e) =>
        setError(
          e instanceof Error ? e.message : "Error al cargar movimientos de futuros"
        )
      )
      .finally(() => setLoading(false));
  }, [portafolioActivoId]);

  const addMovimiento = async (
    movimiento: Omit<MovimientoFuturos, "id" | "portafolioId">,
    portafolioId?: string
  ) => {
    const idEfectivo =
      portafolioId ??
      (portafolioActivoId !== TODOS_LOS_PORTAFOLIOS ? portafolioActivoId : undefined);
    if (!idEfectivo) {
      throw new Error("Elegí en qué portafolio guardar el movimiento.");
    }
    const nuevo = await insertMovimientoFuturos(movimiento, idEfectivo);
    setMovimientos((prev) => [nuevo, ...prev]);
  };

  return (
    <MovimientosFuturosContext.Provider
      value={{ movimientos, loading, error, addMovimiento }}
    >
      {children}
    </MovimientosFuturosContext.Provider>
  );
}

export function useMovimientosFuturos() {
  const ctx = useContext(MovimientosFuturosContext);
  if (!ctx) {
    throw new Error(
      "useMovimientosFuturos debe usarse dentro de MovimientosFuturosProvider"
    );
  }
  return ctx;
}
