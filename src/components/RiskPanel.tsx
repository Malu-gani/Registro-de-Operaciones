"use client";

import type { RiskAnalysis } from "@/types/trading";
import { getRiskLevel, type ClaseActivo, type NivelRiesgo } from "@/utils/riskCalculations";

function rrNivel(ratio: number): "bajo" | "moderado" | "alto" {
  if (ratio < 1) return "alto";
  if (ratio < 2) return "moderado";
  return "bajo";
}

/** Paleta del semáforo de riesgo (matriz por clase de activo, ver riskCalculations.ts). */
const riskBadgeClasses: Record<NivelRiesgo, string> = {
  bajo: "bg-risk-cyan-bg text-risk-cyan border-risk-cyan-border",
  medio: "bg-risk-green-bg text-risk-green border-risk-green-border",
  alto: "bg-risk-orange-bg text-risk-orange border-risk-orange-border",
  critico: "bg-risk-red-bg text-risk-red border-risk-red-border",
};

const riskNivelLabel: Record<NivelRiesgo, string> = {
  bajo: "Bajo",
  medio: "Medio",
  alto: "Alto",
  critico: "Crítico",
};

/** Paleta del badge de Ratio Riesgo/Beneficio (independiente del semáforo de % de riesgo). */
const rrBadgeClasses: Record<"bajo" | "moderado" | "alto", string> = {
  bajo: "bg-risk-green-bg text-risk-green border-risk-green-border",
  moderado: "bg-risk-yellow-bg text-risk-yellow border-risk-yellow-border",
  alto: "bg-risk-red-bg text-risk-red border-risk-red-border",
};

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

function formatMonto(valor: number, divisa: "USD" | "ARS" | "USDT") {
  if (divisa === "ARS") return formatoARS.format(valor);
  if (divisa === "USDT") return `${valor.toFixed(2)} USDT`;
  return formatoUSD.format(valor);
}

export default function RiskPanel({
  camposIncompletos,
  analizar,
  divisa = "USD",
  claseActivo,
}: {
  camposIncompletos: boolean;
  analizar: () => RiskAnalysis;
  divisa?: "USD" | "ARS" | "USDT";
  claseActivo: ClaseActivo;
}) {
  if (camposIncompletos) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-foreground">
          Análisis de riesgo
        </h2>
        <p className="mt-4 text-sm text-foreground-muted">
          Complete la cantidad/monto y el precio de entrada para ver el
          análisis en vivo. Stop Loss y Take Profit son opcionales, pero si
          los completa verá también el ratio riesgo/beneficio.
        </p>
      </div>
    );
  }

  let analysis: RiskAnalysis | undefined;
  let error: string | null = null;

  try {
    analysis = analizar();
  } catch (e) {
    error = e instanceof Error ? e.message : "Error desconocido";
  }

  if (error || !analysis) {
    return (
      <div className="rounded-xl border border-risk-red-border bg-risk-red-bg p-6">
        <h2 className="text-sm font-semibold text-risk-red">
          Análisis de riesgo
        </h2>
        <p className="mt-4 text-sm text-risk-red">{error}</p>
      </div>
    );
  }

  const tieneStopLoss = analysis.perdidaMaximaPorcentaje !== undefined;
  const tieneTakeProfit = analysis.gananciaMaximaPorcentaje !== undefined;
  const tieneRR = analysis.ratioRiesgoBeneficio !== undefined;

  const nivelRiesgo = tieneStopLoss
    ? getRiskLevel(Math.abs(analysis.perdidaMaximaPorcentaje!), claseActivo)
    : null;
  const nivelRR = tieneRR ? rrNivel(analysis.ratioRiesgoBeneficio!) : null;

  const rrClamped = tieneRR ? Math.min(analysis.ratioRiesgoBeneficio!, 5) : null;
  const riesgoBarPct = rrClamped !== null ? (1 / (1 + rrClamped)) * 100 : null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-foreground">
        Análisis de Riesgo
      </h2>

      <div>
        <p className="text-xs text-foreground-muted">
          Tamaño de posición
        </p>
        <p className="mt-1 break-words text-2xl font-semibold text-foreground">
          {analysis.tamañoPosicion.toFixed(6)}{" "}
          <span className="text-sm font-normal text-foreground-muted">
            unidades
          </span>
        </p>
        <p className="text-xs text-foreground-muted">
          ≈ {formatMonto(analysis.valorPosicion, divisa)}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-foreground-muted">
          <span>Ratio riesgo / beneficio</span>
          {tieneRR ? (
            <span
              className={`rounded-full border px-2 py-0.5 font-medium ${rrBadgeClasses[nivelRR!]}`}
            >
              1 : {analysis.ratioRiesgoBeneficio!.toFixed(2)}
            </span>
          ) : (
            <span className="text-foreground-muted">
              Cargue Stop Loss y Take Profit para verlo
            </span>
          )}
        </div>
        {tieneRR && (
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="bg-risk-red"
              style={{ width: `${riesgoBarPct}%` }}
            />
            <div
              className="bg-risk-green"
              style={{ width: `${100 - riesgoBarPct!}%` }}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-risk-red-border bg-risk-red-bg p-3">
          <p className="text-xs font-medium text-risk-red">Pérdida máxima</p>
          {tieneStopLoss ? (
            <>
              <p className="mt-1 text-lg font-semibold text-risk-red">
                -{formatMonto(analysis.perdidaMaximaMonetaria!, divisa)}
              </p>
              <p className="text-xs text-risk-red">
                -{analysis.perdidaMaximaPorcentaje!.toFixed(2)}% del{" "}
                {claseActivo === "futuros" ? "valor nocional" : "capital invertido"}
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-risk-red">
              Cargue el Stop Loss para verla
            </p>
          )}
        </div>
        <div className="rounded-lg border border-risk-green-border bg-risk-green-bg p-3">
          <p className="text-xs font-medium text-risk-green">
            Ganancia máxima
          </p>
          {tieneTakeProfit ? (
            <>
              <p className="mt-1 text-lg font-semibold text-risk-green">
                +{formatMonto(analysis.gananciaMaximaMonetaria!, divisa)}
              </p>
              <p className="text-xs text-risk-green">
                +{analysis.gananciaMaximaPorcentaje!.toFixed(2)}% del{" "}
                {claseActivo === "futuros" ? "valor nocional" : "capital invertido"}
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-risk-green">
              Cargue el Take Profit para verla
            </p>
          )}
        </div>
      </div>

      {nivelRiesgo && (
        <div className={`rounded-lg border p-3 text-sm ${riskBadgeClasses[nivelRiesgo]}`}>
          {nivelRiesgo === "bajo" ? "✓" : "⚠"} Riesgo{" "}
          {riskNivelLabel[nivelRiesgo].toLowerCase()} (
          {analysis.perdidaMaximaPorcentaje!.toFixed(2)}% del{" "}
          {claseActivo === "futuros" ? "valor nocional" : "capital invertido"}
          ).
        </div>
      )}

      {nivelRR === "alto" && (
        <div className="rounded-lg border p-3 text-sm bg-risk-red-bg text-risk-red border-risk-red-border">
          ⚠ Está arriesgando más de lo que podría ganar (R:R menor a 1).
        </div>
      )}
    </div>
  );
}
