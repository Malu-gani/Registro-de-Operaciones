import { describe, expect, test } from "vitest";
import { hayEspacioParaDosColumnas } from "@/hooks/useDosColumnas";

/**
 * OPS-BUG-01: en dos Android reales (Xiaomi 13 Pro, Samsung A55 5G) el grid de
 * los formularios salia a 2 columnas apretadas y los campos se superponian.
 *
 * Fallaron tres intentos seguidos —media query de viewport (`sm:`), container
 * queries CSS, y ResizeObserver— y los tres compartian la misma pregunta:
 * "cuanto mide mi contenedor". El modo de falla del hook es seguro (si el
 * observer no corre, quedan 2 columnas sin activar), asi que ver 2 columnas
 * apretadas significa que la medicion del contenedor devuelve un ancho mayor
 * que la pantalla fisica.
 *
 * La decision se toma con el MENOR entre el contenedor y la ventana: un
 * contenedor no puede tener mas espacio util que la ventana que lo contiene, y
 * cualquier medida inflada queda acotada por la otra.
 */
describe("hayEspacioParaDosColumnas", () => {
  test("dos columnas cuando contenedor y ventana tienen lugar", () => {
    expect(hayEspacioParaDosColumnas(800, 1280, 512)).toBe(true);
  });

  test("una columna cuando el contenedor no llega", () => {
    expect(hayEspacioParaDosColumnas(400, 1280, 512)).toBe(false);
  });

  // El caso del bug: el contenedor se mide inflado en el Android, pero la
  // ventana sigue siendo la de un telefono.
  test("una columna si la ventana no llega, aunque el contenedor se mida inflado", () => {
    expect(hayEspacioParaDosColumnas(980, 412, 512)).toBe(false);
  });

  test("una columna si ninguno de los dos llega", () => {
    expect(hayEspacioParaDosColumnas(360, 412, 512)).toBe(false);
  });

  test("el limite es inclusivo", () => {
    expect(hayEspacioParaDosColumnas(512, 512, 512)).toBe(true);
    expect(hayEspacioParaDosColumnas(511, 512, 512)).toBe(false);
  });

  // Antes del primer callback del observer no hay medida: no adivinar 2
  // columnas, porque equivocarse ahi es justo el bug que se ve en pantalla.
  test("sin medida todavia, una columna", () => {
    expect(hayEspacioParaDosColumnas(0, 412, 512)).toBe(false);
  });
});
