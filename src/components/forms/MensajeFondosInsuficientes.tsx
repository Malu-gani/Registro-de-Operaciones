"use client";

import Link from "next/link";
import type { CuentaId } from "@/types/trading";

const MENSAJES: Record<CuentaId, string> = {
  ars: "Faltan Pesos en tu cuenta en pesos para realizar esta operación.",
  usd: "Faltan USD en tu cuenta en dólares para realizar esta operación.",
  usdt_spot: "Faltan USDT en tu cuenta Crypto (Spot) para realizar esta operación.",
  usdt_futuros: "Faltan USDT en tu cuenta de Futuros para realizar esta operación.",
};

/**
 * Extrae la cuenta de un error de RPC 'FONDOS_INSUFICIENTES:<cuenta>'.
 * Devuelve null si el error no es de fondos insuficientes.
 */
export function cuentaFaltante(error: unknown): CuentaId | null {
  const msg = error instanceof Error ? error.message : String(error);
  const m = msg.match(/FONDOS_INSUFICIENTES:(ars|usd|usdt_spot|usdt_futuros)/);
  return m ? (m[1] as CuentaId) : null;
}

/** Mensaje de saldo insuficiente + CTA para depositar en la cuenta que falta. */
export default function MensajeFondosInsuficientes({ cuenta }: { cuenta: CuentaId }) {
  return (
    <div className="rounded-md border border-risk-red-border bg-risk-red-bg px-3 py-2 text-xs text-risk-red">
      <p>{MENSAJES[cuenta]}</p>
      <Link
        href={`/cuenta?cuenta=${cuenta}`}
        className="mt-1 inline-block font-semibold underline"
      >
        Aquí puedes depositar para continuar la operación
      </Link>
    </div>
  );
}
