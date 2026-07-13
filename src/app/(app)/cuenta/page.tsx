"use client";

import { useMemo } from "react";
import { useTrades } from "@/context/TradesContext";
import { usePlazosFijos } from "@/context/PlazosFijosContext";
import { useCuentas } from "@/context/CuentasContext";
import { TODOS_LOS_PORTAFOLIOS, usePortafolios } from "@/context/PortafoliosContext";
import { plazoFijoVencido } from "@/utils/riskCalculations";
import { comprometidoPorCuenta } from "@/utils/cuentas";
import type { CuentaId, Divisa } from "@/types/trading";

const CUENTAS: { id: CuentaId; label: string; divisa: Divisa }[] = [
  { id: "ars", label: "Pesos (ARS)", divisa: "ARS" },
  { id: "usd", label: "Dólares (USD)", divisa: "USD" },
  { id: "usdt_spot", label: "Cripto Spot (USDT)", divisa: "USDT" },
  { id: "usdt_futuros", label: "Futuros (USDT)", divisa: "USDT" },
];

const formatoUSD = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const formatoARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

function formatMonto(valor: number, divisa: Divisa) {
  if (divisa === "ARS") return formatoARS.format(valor);
  if (divisa === "USDT")
    return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(valor)} USDT`;
  return formatoUSD.format(valor);
}

export default function CuentaPage() {
  const { portafolios, portafolioActivoId } = usePortafolios();
  const { trades } = useTrades();
  const { plazosFijos } = usePlazosFijos();
  const { disponibleDe, loading, error } = useCuentas();

  const esPortafolioEspecifico = portafolioActivoId !== TODOS_LOS_PORTAFOLIOS;
  const nombrePortafolio = portafolios.find((p) => p.id === portafolioActivoId)?.nombre;

  const comprometido = useMemo(() => {
    const plazosPendientes = plazosFijos.filter(
      (pf) => !plazoFijoVencido(pf.fechaVencimiento)
    );
    return comprometidoPorCuenta(trades, plazosPendientes);
  }, [trades, plazosFijos]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">Cuenta</h1>

      {error && (
        <div className="rounded-lg border border-risk-red-border bg-risk-red-bg p-4 text-sm text-risk-red">
          {error}
        </div>
      )}

      {!esPortafolioEspecifico ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-foreground-muted">
          Elija un portafolio específico en el selector de arriba para ver y
          administrar sus saldos. Cada portafolio lleva sus propias cuentas.
        </div>
      ) : (
        <>
          <p className="text-sm text-foreground-muted">
            Saldos de <span className="text-foreground">{nombrePortafolio}</span>.
            El <span className="text-foreground">Disponible</span> es tu capital
            libre; el <span className="text-foreground">Comprometido</span> es lo
            invertido en posiciones abiertas y plazos fijos.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CUENTAS.map((c) => {
              const disponible = disponibleDe(portafolioActivoId, c.id);
              const comp = comprometido[c.id];
              const total = disponible + comp;
              return (
                <div
                  key={c.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{c.label}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-foreground-muted">Disponible</p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                        {loading ? "…" : formatMonto(disponible, c.divisa)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-muted">Comprometido</p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground-muted">
                        {formatMonto(comp, c.divisa)}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-border pt-2">
                    <p className="text-xs text-foreground-muted">
                      Total en la cuenta{" "}
                      <span className="font-medium text-foreground">
                        {loading ? "…" : formatMonto(total, c.divisa)}
                      </span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
