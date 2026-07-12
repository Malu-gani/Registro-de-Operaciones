"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Trade } from "@/types/trading";
import {
  closeTrade as closeTradeApi,
  closeTradePartial as closeTradePartialApi,
  fetchTrades,
  insertTrade,
} from "@/lib/tradesApi";
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
}

const TradesContext = createContext<TradesContextValue | null>(null);

export function TradesProvider({ children }: { children: React.ReactNode }) {
  const { portafolioActivoId } = usePortafolios();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError(
        "Supabase no está configurado. Complete .env.local con NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY y reinicie el servidor (npm run dev)."
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    const portafolioId =
      portafolioActivoId === TODOS_LOS_PORTAFOLIOS ? undefined : portafolioActivoId;

    fetchTrades(portafolioId)
      .then(setTrades)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Error al cargar operaciones")
      )
      .finally(() => setLoading(false));
  }, [portafolioActivoId]);

  const addTrade = async (
    trade: Omit<Trade, "id" | "portafolioId">,
    portafolioId?: string
  ) => {
    const idEfectivo =
      portafolioId ??
      (portafolioActivoId !== TODOS_LOS_PORTAFOLIOS ? portafolioActivoId : undefined);
    if (!idEfectivo) {
      throw new Error("Elija en qué portafolio guardar la operación.");
    }
    const nuevo = await insertTrade(trade, idEfectivo);
    setTrades((prev) => [nuevo, ...prev]);
  };

  const closeTrade = async (
    id: string,
    cierre: { fechaSalida: string; precioSalida: number; resultadoPnl: number }
  ) => {
    const actualizado = await closeTradeApi(id, cierre);
    setTrades((prev) => prev.map((t) => (t.id === id ? actualizado : t)));
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
    if (cierre.cantidadCerrada >= trade.cantidad) {
      await closeTrade(trade.id, {
        fechaSalida: cierre.fechaSalida,
        precioSalida: cierre.precioSalida,
        resultadoPnl: cierre.resultadoPnl,
      });
      return;
    }
    const { actualizado, cerrado } = await closeTradePartialApi(trade, cierre);
    setTrades((prev) => [
      cerrado,
      ...prev.map((t) => (t.id === trade.id ? actualizado : t)),
    ]);
  };

  return (
    <TradesContext.Provider
      value={{ trades, loading, error, addTrade, closeTrade, closeTradePartial }}
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
