import { describe, expect, test } from "vitest";
import {
  mensajeCamposFaltantes,
  precioOpcional,
  unirFaltantes,
} from "@/components/forms/formValidation";

describe("unirFaltantes", () => {
  test("una lista vacía da cadena vacía", () => {
    expect(unirFaltantes([])).toBe("");
  });

  test("un solo item va sin conectores", () => {
    expect(unirFaltantes(["el activo"])).toBe("el activo");
  });

  test("dos items se unen con 'y'", () => {
    expect(unirFaltantes(["el activo", "la cantidad"])).toBe("el activo y la cantidad");
  });

  test("tres o más usan comas y una 'y' final", () => {
    expect(unirFaltantes(["el activo", "la cantidad", "el precio"])).toBe(
      "el activo, la cantidad y el precio"
    );
  });
});

describe("mensajeCamposFaltantes", () => {
  test("usa el registro formal (usted) y cierra con punto", () => {
    expect(mensajeCamposFaltantes(["el activo"])).toBe(
      "Complete los siguientes campos obligatorios: el activo."
    );
  });
});

describe("precioOpcional", () => {
  test("el campo vacío (NaN) es 'sin cargar'", () => {
    expect(precioOpcional(Number.parseFloat(""))).toBeUndefined();
  });

  test("un precio cargado se devuelve tal cual", () => {
    expect(precioOpcional(90)).toBe(90);
  });

  // El defecto 9.9 del lado del formulario: con `precio || undefined`, el cero
  // se perdía y el análisis de riesgo nunca llegaba a validarlo.
  test("el cero es un valor cargado, no un campo vacío", () => {
    expect(precioOpcional(0)).toBe(0);
  });
});
