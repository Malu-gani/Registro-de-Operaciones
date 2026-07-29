import { describe, expect, test } from "vitest";
import {
  getRiskLevel,
  UMBRALES_RIESGO_DEFAULT,
  type ClaseActivo,
  type NivelRiesgo,
} from "@/utils/riskCalculations";

/**
 * Cada nivel es inclusive en su límite superior: 3.00 todavía es "bajo" y 3.01
 * ya es "medio". Son los bordes donde un `<` en vez de un `<=` pasa inadvertido.
 */
const CASOS_DEFAULT: Array<[ClaseActivo, number, NivelRiesgo]> = [
  ["acciones", 0, "bajo"],
  ["acciones", 3, "bajo"],
  ["acciones", 3.01, "medio"],
  ["acciones", 8, "medio"],
  ["acciones", 8.01, "alto"],
  ["acciones", 15, "alto"],
  ["acciones", 15.01, "critico"],
  ["cripto_spot", 5, "bajo"],
  ["cripto_spot", 5.01, "medio"],
  ["cripto_spot", 15, "medio"],
  ["cripto_spot", 15.01, "alto"],
  ["cripto_spot", 25, "alto"],
  ["cripto_spot", 25.01, "critico"],
  ["futuros", 1, "bajo"],
  ["futuros", 1.01, "medio"],
  ["futuros", 3, "medio"],
  ["futuros", 3.01, "alto"],
  ["futuros", 10, "alto"],
  ["futuros", 10.01, "critico"],
];

describe("getRiskLevel con umbrales por defecto", () => {
  test.each(CASOS_DEFAULT)("%s al %f%% es %s", (clase, porcentaje, esperado) => {
    expect(getRiskLevel(porcentaje, clase)).toBe(esperado);
  });

  test("un riesgo mayor al 100% sigue siendo crítico", () => {
    expect(getRiskLevel(250, "acciones")).toBe("critico");
  });
});

describe("getRiskLevel con umbrales personalizados", () => {
  const personalizados = {
    ...UMBRALES_RIESGO_DEFAULT,
    acciones: { bajo: 1, medio: 2, alto: 4 },
  };

  test.each([
    [1, "bajo"],
    [1.5, "medio"],
    [2, "medio"],
    [3, "alto"],
    [4, "alto"],
    [4.5, "critico"],
  ] as Array<[number, NivelRiesgo]>)(
    "con cortes 1/2/4, %f%% es %s",
    (porcentaje, esperado) => {
      expect(getRiskLevel(porcentaje, "acciones", personalizados)).toBe(esperado);
    }
  );

  test("los umbrales personalizados de una clase no afectan a las otras", () => {
    expect(getRiskLevel(4, "cripto_spot", personalizados)).toBe("bajo");
  });
});
