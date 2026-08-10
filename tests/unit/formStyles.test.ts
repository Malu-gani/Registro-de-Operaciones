import { describe, expect, test } from "vitest";
import { clasesGridColumnas } from "@/components/formStyles";

/**
 * Los 3 formularios armaban la clase del grid como
 *   `grid grid-cols-1 gap-4 ${dosColumnas ? "grid-cols-2" : ""}`
 * y con `dosColumnas` en true el elemento quedaba con grid-cols-1 Y
 * grid-cols-2 a la vez. Andaba de casualidad: en el CSS que emite Tailwind
 * grid-cols-2 viene despues de grid-cols-1 y gana la cascada. Depender del
 * orden de emision de una herramienta no es una decision del codigo, asi que
 * la regla es que salga exactamente una clase de columnas.
 */
describe("clasesGridColumnas", () => {
  test("con dos columnas no arrastra la clase de una columna", () => {
    const clases = clasesGridColumnas(true);

    expect(clases).toContain("grid-cols-2");
    expect(clases).not.toContain("grid-cols-1");
  });

  test("con una columna no adelanta la clase de dos columnas", () => {
    const clases = clasesGridColumnas(false);

    expect(clases).toContain("grid-cols-1");
    expect(clases).not.toContain("grid-cols-2");
  });

  test("emite una sola clase de columnas, sea cual sea el caso", () => {
    for (const dosColumnas of [true, false]) {
      const cuantas = clasesGridColumnas(dosColumnas).match(/grid-cols-\d/g) ?? [];

      expect(cuantas).toHaveLength(1);
    }
  });

  test("conserva el grid y el gap que compartian los 3 formularios", () => {
    for (const dosColumnas of [true, false]) {
      expect(clasesGridColumnas(dosColumnas)).toMatch(/(^|\s)grid(\s|$)/);
      expect(clasesGridColumnas(dosColumnas)).toContain("gap-4");
    }
  });
});
