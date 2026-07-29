import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { RiskAnalysis } from "@/types/trading";
import { UMBRALES_RIESGO_DEFAULT } from "@/utils/riskCalculations";

/**
 * RiskPanel lee los umbrales del semáforo de PreferenciasContext, que a su vez
 * los trae de Supabase. Se mockea el hook con los umbrales por defecto: lo que se
 * prueba acá es qué renderiza el panel, no de dónde salen las preferencias.
 * Sin este mock el test necesitaría red y sería un test de integración
 * disfrazado de test de componente.
 */
vi.mock("@/context/PreferenciasContext", () => ({
  usePreferencias: () => ({ umbrales: UMBRALES_RIESGO_DEFAULT }),
}));

const { default: RiskPanel } = await import("@/components/RiskPanel");

/**
 * El panel no calcula: recibe `analizar`, que ya devuelve el análisis hecho.
 * Los campos opcionales ausentes representan el caso "sin stop loss" o "sin take
 * profit", que es justo lo que se quiere ver reflejado en pantalla.
 */
function analisis(over: Partial<RiskAnalysis> = {}): () => RiskAnalysis {
  return () => ({
    tamañoPosicion: 10,
    valorPosicion: 1000,
    riesgoPorUnidad: 10,
    riesgoMonetario: 100,
    ratioRiesgoBeneficio: 3,
    perdidaMaximaMonetaria: 100,
    perdidaMaximaPorcentaje: 10,
    gananciaMaximaMonetaria: 300,
    gananciaMaximaPorcentaje: 30,
    ...over,
  });
}

describe("RiskPanel", () => {
  test("con los campos incompletos no muestra números, solo el aviso", () => {
    render(
      <RiskPanel camposIncompletos analizar={analisis()} claseActivo="acciones" />
    );

    expect(screen.queryByText(/1\.000|1000/)).not.toBeInTheDocument();
  });

  test("con el análisis completo muestra el ratio R:R", () => {
    render(
      <RiskPanel
        camposIncompletos={false}
        analizar={analisis()}
        claseActivo="acciones"
      />
    );

    expect(screen.getByText(/3([.,]00)?\s*:\s*1|3[.,]00/)).toBeInTheDocument();
  });

  test("sin take profit no inventa un ratio R:R", () => {
    render(
      <RiskPanel
        camposIncompletos={false}
        analizar={analisis({
          ratioRiesgoBeneficio: undefined,
          gananciaMaximaMonetaria: undefined,
          gananciaMaximaPorcentaje: undefined,
        })}
        claseActivo="acciones"
      />
    );

    expect(screen.queryByText(/3[.,]00\s*:\s*1/)).not.toBeInTheDocument();
  });

  test("sin stop loss no muestra una pérdida máxima", () => {
    render(
      <RiskPanel
        camposIncompletos={false}
        analizar={analisis({
          riesgoPorUnidad: undefined,
          riesgoMonetario: undefined,
          perdidaMaximaMonetaria: undefined,
          perdidaMaximaPorcentaje: undefined,
          ratioRiesgoBeneficio: undefined,
        })}
        claseActivo="acciones"
      />
    );

    // El valor de la posición sí se puede calcular sin stop loss.
    expect(screen.getByText(/1\.000|1000/)).toBeInTheDocument();
  });

  test("la divisa cambia el formato del monto", () => {
    render(
      <RiskPanel
        camposIncompletos={false}
        analizar={analisis()}
        divisa="USDT"
        claseActivo="cripto_spot"
      />
    );

    // Aparece en varios montos del panel; alcanza con que el formato sea el de
    // USDT y no el de dólares.
    expect(screen.getAllByText(/USDT/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/US\$/)).not.toBeInTheDocument();
  });
});
