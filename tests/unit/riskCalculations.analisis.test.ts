import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  analizarRiesgoApalancado,
  analizarRiesgoPosicionFija,
  calcularPlazoFijo,
  calcularPnl,
  calcularRatioRiesgoBeneficio,
  plazoFijoVencido,
} from "@/utils/riskCalculations";

describe("validación direccional de Stop Loss y Take Profit", () => {
  const base = { precioEntrada: 100, cantidad: 10 } as const;

  test("Long con Stop Loss por debajo de la entrada es válido", () => {
    const r = analizarRiesgoPosicionFija({
      ...base,
      precioStopLoss: 90,
      tipoOperacion: "long",
    });
    expect(r.riesgoPorUnidad).toBe(10);
  });

  test("Long con Stop Loss por encima de la entrada se rechaza", () => {
    expect(() =>
      analizarRiesgoPosicionFija({ ...base, precioStopLoss: 110, tipoOperacion: "long" })
    ).toThrow(/Long.*Stop Loss debe ser menor/);
  });

  test("Short con Stop Loss por encima de la entrada es válido", () => {
    const r = analizarRiesgoPosicionFija({
      ...base,
      precioStopLoss: 110,
      tipoOperacion: "short",
    });
    expect(r.riesgoPorUnidad).toBe(10);
  });

  test("Short con Stop Loss por debajo de la entrada se rechaza", () => {
    expect(() =>
      analizarRiesgoPosicionFija({ ...base, precioStopLoss: 90, tipoOperacion: "short" })
    ).toThrow(/Short.*Stop Loss debe ser mayor/);
  });

  test("Long con Take Profit por debajo de la entrada se rechaza", () => {
    expect(() =>
      analizarRiesgoPosicionFija({ ...base, precioTakeProfit: 90, tipoOperacion: "long" })
    ).toThrow(/Long.*Take Profit debe ser mayor/);
  });

  test("Short con Take Profit por encima de la entrada se rechaza", () => {
    expect(() =>
      analizarRiesgoPosicionFija({ ...base, precioTakeProfit: 110, tipoOperacion: "short" })
    ).toThrow(/Short.*Take Profit debe ser menor/);
  });
});

describe("casos borde del cálculo", () => {
  test("Stop Loss igual a la entrada lanza error controlado, no Infinity", () => {
    expect(() =>
      analizarRiesgoPosicionFija({
        precioEntrada: 100,
        precioStopLoss: 100,
        cantidad: 10,
        tipoOperacion: "long",
      })
    ).toThrow(/no puede ser igual/);
  });

  test("sin precio de entrada lanza error", () => {
    expect(() =>
      analizarRiesgoPosicionFija({
        precioEntrada: 0,
        cantidad: 10,
        tipoOperacion: "long",
      })
    ).toThrow(/precio de entrada/);
  });

  // Defecto 9.9 de docs/testing.md, ARREGLADO: `if (precioStopLoss)` trataba el 0 como
  // "sin stop loss", así que un SL de 0 se ignoraba en silencio en vez de
  // validarse. Ahora los precios opcionales se chequean contra `undefined`.
  test("un Stop Loss de 0 en un Short se rechaza por dirección", () => {
    expect(() =>
      analizarRiesgoPosicionFija({
        precioEntrada: 100,
        precioStopLoss: 0,
        cantidad: 10,
        tipoOperacion: "short",
      })
    ).toThrow(/Short.*Stop Loss debe ser mayor/);
  });
});

describe("métricas opcionales según los datos cargados", () => {
  const base = {
    precioEntrada: 100,
    cantidad: 10,
    tipoOperacion: "long",
  } as const;

  test("sin Stop Loss ni Take Profit devuelve tamaño y valor de posición", () => {
    const r = analizarRiesgoPosicionFija(base);
    expect(r.tamañoPosicion).toBe(10);
    expect(r.valorPosicion).toBe(1000);
    expect(r.riesgoPorUnidad).toBeUndefined();
    expect(r.ratioRiesgoBeneficio).toBeUndefined();
    expect(r.perdidaMaximaMonetaria).toBeUndefined();
    expect(r.gananciaMaximaMonetaria).toBeUndefined();
  });

  test("solo con Stop Loss calcula pérdida máxima pero no R:R", () => {
    const r = analizarRiesgoPosicionFija({ ...base, precioStopLoss: 90 });
    expect(r.perdidaMaximaMonetaria).toBe(100);
    expect(r.perdidaMaximaPorcentaje).toBe(10);
    expect(r.gananciaMaximaMonetaria).toBeUndefined();
    expect(r.ratioRiesgoBeneficio).toBeUndefined();
  });

  test("solo con Take Profit calcula ganancia máxima pero no R:R", () => {
    const r = analizarRiesgoPosicionFija({ ...base, precioTakeProfit: 120 });
    expect(r.gananciaMaximaMonetaria).toBe(200);
    expect(r.gananciaMaximaPorcentaje).toBe(20);
    expect(r.perdidaMaximaMonetaria).toBeUndefined();
    expect(r.ratioRiesgoBeneficio).toBeUndefined();
  });

  test("con ambos calcula R:R", () => {
    const r = analizarRiesgoPosicionFija({
      ...base,
      precioStopLoss: 90,
      precioTakeProfit: 120,
    });
    expect(r.ratioRiesgoBeneficio).toBe(2);
  });
});

describe("modo apalancado", () => {
  test("el apalancamiento queda embebido en el tamaño de posición", () => {
    const r = analizarRiesgoApalancado({
      precioEntrada: 100,
      monto: 1000,
      apalancamiento: 10,
      tipoOperacion: "long",
    });
    expect(r.tamañoPosicion).toBe(100);
    expect(r.valorPosicion).toBe(10000);
  });

  test("con apalancamiento 1 (spot) el valor de posición es el monto invertido", () => {
    const r = analizarRiesgoApalancado({
      precioEntrada: 250,
      monto: 1000,
      apalancamiento: 1,
      tipoOperacion: "long",
    });
    expect(r.tamañoPosicion).toBe(4);
    expect(r.valorPosicion).toBe(1000);
  });

  test("el % de pérdida máxima no depende del apalancamiento", () => {
    const conApalancamiento = analizarRiesgoApalancado({
      precioEntrada: 100,
      precioStopLoss: 95,
      monto: 1000,
      apalancamiento: 10,
      tipoOperacion: "long",
    });
    expect(conApalancamiento.perdidaMaximaPorcentaje).toBeCloseTo(5, 10);
  });
});

describe("calcularRatioRiesgoBeneficio", () => {
  test("devuelve recompensa sobre riesgo", () => {
    expect(calcularRatioRiesgoBeneficio(100, 90, 130)).toBe(3);
  });

  // Defecto 9.8 de docs/testing.md, ARREGLADO: esta función devolvía 0 cuando el riesgo
  // era cero, mientras el núcleo de cálculo lanza error para el mismo caso.
  // `financial-logic.md` documenta el error. Ahora delega en el núcleo.
  test("con Stop Loss igual a la entrada lanza error, igual que el núcleo", () => {
    expect(() => calcularRatioRiesgoBeneficio(100, 100, 130)).toThrow();
  });

  // La otra cara del mismo defecto: con Math.abs, un Stop Loss del lado
  // equivocado daba un R:R lindo en vez de un error.
  test("un Stop Loss por encima de la entrada en un Long se rechaza", () => {
    expect(() => calcularRatioRiesgoBeneficio(100, 110, 130)).toThrow(
      /Long.*Stop Loss debe ser menor/
    );
  });

  test("con la dirección Short, valida contra el lado que corresponde", () => {
    expect(calcularRatioRiesgoBeneficio(100, 110, 70, "short")).toBe(3);
  });
});

describe("calcularPnl", () => {
  test.each([
    ["long", 100, 120, 10, 200],
    ["long", 100, 80, 10, -200],
    ["short", 100, 80, 10, 200],
    ["short", 100, 120, 10, -200],
  ] as Array<["long" | "short", number, number, number, number]>)(
    "%s de %f a %f por %f unidades da %f",
    (tipo, entrada, salida, cantidad, esperado) => {
      expect(calcularPnl(tipo, entrada, salida, cantidad)).toBe(esperado);
    }
  );
});

describe("calcularPlazoFijo", () => {
  test("interés simple no capitalizable", () => {
    const { interesEstimado } = calcularPlazoFijo(100000, 73, 30, "2026-03-01");
    expect(interesEstimado).toBeCloseTo(6000, 6);
  });

  test("la fecha de vencimiento suma los días al inicio", () => {
    expect(calcularPlazoFijo(1000, 50, 30, "2026-03-01").fechaVencimiento).toBe(
      "2026-03-31"
    );
  });

  test("cruza fin de mes correctamente", () => {
    expect(calcularPlazoFijo(1000, 50, 30, "2026-01-20").fechaVencimiento).toBe(
      "2026-02-19"
    );
  });

  test("cruza fin de año correctamente", () => {
    expect(calcularPlazoFijo(1000, 50, 45, "2026-12-01").fechaVencimiento).toBe(
      "2027-01-15"
    );
  });
});

describe("plazoFijoVencido", () => {
  // Se fija la hora del sistema a las 22:00 de Argentina (UTC-3), momento en que
  // la fecha UTC ya es la del día siguiente. Es el escenario del defecto 9.3.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T01:00:00.000Z")); // 2026-07-28 22:00 ART
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("un plazo vencido ayer está vencido", () => {
    expect(plazoFijoVencido("2026-07-27")).toBe(true);
  });

  // Defecto 9.3 de docs/testing.md, ARREGLADO: comparaba contra la fecha UTC, así que a
  // las 22:00 ART del día 28 ya consideraba vencido un plazo que vence el 29.
  // El huso de la suite está fijado en vitest.config.ts.
  test("un plazo que vence mañana NO está vencido a las 22:00 de hoy", () => {
    expect(plazoFijoVencido("2026-07-29")).toBe(false);
  });
});
