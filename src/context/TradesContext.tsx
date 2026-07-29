"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Trade } from "@/types/trading";
import { abrirOperacion, cerrarOperacion, fetchTrades } from "@/lib/tradesApi";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { TODOS_LOS_PORTAFOLIOS, usePortafolios } from "./PortafoliosContext";

interface TradesContextValue {
  trades: Trade[];
  loading: boolean;
  error: string | null;
  addTrade: (
    trade: Omit<Trade, "id" | "portafolioId">,
    portafolioId?: string
  ) => Promise<void>;
  closeTrade: (
    id: string,
    cierre: { fechaSalida: string; precioSalida: number; resultadoPnl: number }
  ) => Promise<void>;
  closeTradePartial: (
    trade: Trade,
    cierre: {
      fechaSalida: string;
      precioSalida: number;
      resultadoPnl: number;
      cantidadCerrada: number;
    }
  ) => Promise<void>;
  /** Vuelve a leer las operaciones del servidor (tras una importación masiva). */
  recargar: () => Promise<void>;
}

const TradesContext = createContext<TradesContextValue | null>(null);

export function TradesProvider({ children }: { children: React.ReactNode }) {
  const { portafolioActivoId } = usePortafolios();
  const [trades, setTrades] = useState<Trade[]>([]);
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
      setTrades(await fetchTrades(portafolioId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar operaciones");
    } finally {
      setLoading(false);
    }
  }, [portafolioId]);

  // Carga inicial y recarga al cambiar de portafolio activo. Es el caso legítimo
  // de useEffect: sincronizar con un sistema externo (Supabase) al montar. La
  // regla lo marca por el setState síncrono del estado de carga/config; la
  // alternativa sería una librería de data-fetching (SWR), fuera de alcance acá.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar, ver comentario arriba
    cargar();
  }, [cargar]);

  const addTrade = async (
    trade: Omit<Trade, "id" | "portafolioId">,
    portafolioIdArg?: string
  ) => {
    const idEfectivo = portafolioIdArg ?? portafolioId;
    if (!idEfectivo) {
      throw new Error("Elija en qué portafolio guardar la operación.");
    }
    const nuevo = await abrirOperacion(trade, idEfectivo);
    setTrades((prev) => [nuevo, ...prev]);
  };

  const closeTrade = async (
    id: string,
    cierre: { fechaSalida: string; precioSalida: number; resultadoPnl: number }
  ) => {
    // Cierre total: la cantidad la resuelve la función del servidor.
    const actual = trades.find((t) => t.id === id);
    await cerrarOperacion(id, {
      precioSalida: cierre.precioSalida,
      fechaSalida: cierre.fechaSalida,
      cantidadCerrada: actual?.cantidad ?? 0,
    });
    await cargar();
  };

  const closeTradePartial = async (
    trade: Trade,
    cierre: {
      fechaSalida: string;
      precioSalida: number;
      resultadoPnl: number;
      cantidadCerrada: number;
    }
  ) => {
    await cerrarOperacion(trade.id, {
      precioSalida: cierre.precioSalida,
      fechaSalida: cierre.fechaSalida,
      cantidadCerrada: cierre.cantidadCerrada,
    });
    await cargar();
  };

  return (
    <TradesContext.Provider
      value={{ trades, loading, error, addTrade, closeTrade, closeTradePartial, recargar: cargar }}
    >
      {children}
    </TradesContext.Provider>
  );
}

export function useTrades() {
  const ctx = useContext(TradesContext);
  if (!ctx) {
    throw new Error("useTrades debe usarse dentro de TradesProvider");
  }
  return ctx;
}
