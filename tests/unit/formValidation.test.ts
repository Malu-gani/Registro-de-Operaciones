import { describe, expect, test } from "vitest";
import { mensajeCamposFaltantes, unirFaltantes } from "@/components/forms/formValidation";

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
