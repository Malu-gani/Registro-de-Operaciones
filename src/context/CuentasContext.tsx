"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { CuentaId, MovimientoCuenta, SaldoCuenta } from "@/types/trading";
import {
  fetchSaldos,
  registrarMovimientoCuenta,
  setSaldoInicial as setSaldoInicialApi,
} from "@/lib/cuentasApi";
import { fetchMovimientosCuenta } from "@/lib/movimientosCuentaApi";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { TODOS_LOS_PORTAFOLIOS, usePortafolios } from "./PortafoliosContext";

interface CuentasContextValue {
  saldos: SaldoCuenta[];
  movimientos: MovimientoCuenta[];
  loading: boolean;
  error: string | null;
  /** Disponible de una cuenta en un portafolio (0 si no tiene saldo cargado). */
  disponibleDe: (portafolioId: string, cuenta: CuentaId) => number;
  /** Fija el saldo inicial de una cuenta ("cargá tus saldos de hoy"). */
  setSaldoInicial: (
    portafolioId: string,
    cuenta: CuentaId,
    monto: number
  ) => Promise<void>;
  /** Depósito o retiro manual sobre el Disponible de una cuenta. */
  depositarRetirar: (
    portafolioId: string,
    cuenta: CuentaId,
    tipo: "deposito" | "retiro",
    monto: number,
    fecha: string,
    notas?: string
  ) => Promise<void>;
  /** Vuelve a leer saldos y movimientos (tras un depósito/retiro/operación). */
  refrescar: () => Promise<void>;
}

const CuentasContext = createContext<CuentasContextValue | null>(null);

export function CuentasProvider({ children }: { children: React.ReactNode }) {
  const { portafolioActivoId } = usePortafolios();
  const [saldos, setSaldos] = useState<SaldoCuenta[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoCuenta[]>([]);
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
      const [s, m] = await Promise.all([
        fetchSaldos(portafolioId),
        fetchMovimientosCuenta(portafolioId),
      ]);
      setSaldos(s);
      setMovimientos(m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los saldos");
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

  const disponibleDe = useCallback(
    (pId: string, cuenta: CuentaId) =>
      saldos.find((s) => s.portafolioId === pId && s.cuenta === cuenta)?.disponible ?? 0,
    [saldos]
  );

  const setSaldoInicial = useCallback(
    async (pId: string, cuenta: CuentaId, monto: number) => {
      await setSaldoInicialApi(pId, cuenta, monto);
      await cargar();
    },
    [cargar]
  );

  const depositarRetirar = useCallback(
    async (
      pId: string,
      cuenta: CuentaId,
      tipo: "deposito" | "retiro",
      monto: number,
      fecha: string,
      notas?: string
    ) => {
      await registrarMovimientoCuenta(pId, cuenta, tipo, monto, fecha, notas);
      await cargar();
    },
    [cargar]
  );

  return (
    <CuentasContext.Provider
      value={{
        saldos,
        movimientos,
        loading,
        error,
        disponibleDe,
        setSaldoInicial,
        depositarRetirar,
        refrescar: cargar,
      }}
    >
      {children}
    </CuentasContext.Provider>
  );
}

export function useCuentas() {
  const ctx = useContext(CuentasContext);
  if (!ctx) {
    throw new Error("useCuentas debe usarse dentro de CuentasProvider");
  }
  return ctx;
}
