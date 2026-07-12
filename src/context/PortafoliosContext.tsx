"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Portafolio, TipoMercadoPortafolio } from "@/types/trading";
import {
  createPortafolio,
  deletePortafolio,
  fetchPortafolios,
  renamePortafolio,
} from "@/lib/portafoliosApi";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export const TODOS_LOS_PORTAFOLIOS = "todos" as const;

const STORAGE_KEY = "portafolioActivoId";

interface PortafoliosContextValue {
  portafolios: Portafolio[];
  loading: boolean;
  error: string | null;
  portafolioActivoId: string;
  setPortafolioActivoId: (id: string) => void;
  crearPortafolio: (
    nombre: string,
    tipoMercado: TipoMercadoPortafolio
  ) => Promise<Portafolio>;
  renombrarPortafolio: (id: string, nombre: string) => Promise<void>;
  eliminarPortafolio: (id: string) => Promise<void>;
}

const PortafoliosContext = createContext<PortafoliosContextValue | null>(null);

export function PortafoliosProvider({ children }: { children: React.ReactNode }) {
  const [portafolios, setPortafolios] = useState<Portafolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portafolioActivoId, setPortafolioActivoIdState] =
    useState<string>(TODOS_LOS_PORTAFOLIOS);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(
        "Supabase no está configurado. Completá .env.local con NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY y reiniciá el servidor (npm run dev)."
      );
      setLoading(false);
      return;
    }

    fetchPortafolios()
      .then((lista) => {
        setPortafolios(lista);
        const guardado =
          typeof window !== "undefined"
            ? window.localStorage.getItem(STORAGE_KEY)
            : null;
        const esValido =
          guardado === TODOS_LOS_PORTAFOLIOS ||
          lista.some((p) => p.id === guardado);
        setPortafolioActivoIdState(
          esValido && guardado ? guardado : TODOS_LOS_PORTAFOLIOS
        );
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Error al cargar portafolios")
      )
      .finally(() => setLoading(false));
  }, []);

  const setPortafolioActivoId = (id: string) => {
    setPortafolioActivoIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  };

  const crearPortafolio = async (
    nombre: string,
    tipoMercado: TipoMercadoPortafolio
  ) => {
    const nuevo = await createPortafolio(nombre, tipoMercado);
    setPortafolios((prev) => [...prev, nuevo]);
    return nuevo;
  };

  const renombrarPortafolio = async (id: string, nombre: string) => {
    const actualizado = await renamePortafolio(id, nombre);
    setPortafolios((prev) => prev.map((p) => (p.id === id ? actualizado : p)));
  };

  const eliminarPortafolio = async (id: string) => {
    await deletePortafolio(id);
    setPortafolios((prev) => prev.filter((p) => p.id !== id));
    if (portafolioActivoId === id) {
      setPortafolioActivoId(TODOS_LOS_PORTAFOLIOS);
    }
  };

  return (
    <PortafoliosContext.Provider
      value={{
        portafolios,
        loading,
        error,
        portafolioActivoId,
        setPortafolioActivoId,
        crearPortafolio,
        renombrarPortafolio,
        eliminarPortafolio,
      }}
    >
      {children}
    </PortafoliosContext.Provider>
  );
}

export function usePortafolios() {
  const ctx = useContext(PortafoliosContext);
  if (!ctx) {
    throw new Error("usePortafolios debe usarse dentro de PortafoliosProvider");
  }
  return ctx;
}
