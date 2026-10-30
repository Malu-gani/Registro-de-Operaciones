import { describe, expect, test } from "vitest";
import { clasesCamposFormulario, clasesLayoutFormulario } from "@/components/formStyles";

/**
 * OPS-BUG-01: el grid de campos de los 3 formularios de alta salia a 2 columnas
 * apretadas en dos Android reales (Xiaomi 13 Pro, Samsung A55 5G) y los campos
 * se superponian. Fallaron CUATRO intentos, todos basados en decidir por ancho:
 *
 *   1. media query de viewport (`sm:grid-cols-2`)
 *   2. container queries CSS (`@container` + `@lg:`)
 *   3. medir el contenedor con ResizeObserver
 *   4. tomar el menor entre contenedor y ventana
 *
 * CORRECCION IMPORTANTE: de ahi se concluyo que "ninguna medida de ancho es
 * confiable en esos dispositivos". Era FALSO. La causa real eran los
 * `col-span-2` que quedaban en los campos, que dentro de un `grid-cols-1`
 * crean una segunda columna implicita y aplastan la primera. No dependia del
 * ancho ni del dispositivo. Ver `tests/unit/formColSpan.test.ts`, que es el
 * test que fija la causa de verdad.
 *
 * Este archivo sigue fijando la decision de una sola columna, que es la que
 * esta en produccion hoy. Ya no es la unica solucion posible: quitados los
 * col-span, dos columnas en pantallas anchas volvio a ser viable. Si se
 * cambia, se cambian estos tests a conciencia y se valida en un Android real.
 */
describe("clasesCamposFormulario", () => {
  test("declara una sola columna", () => {
    expect(clasesCamposFormulario).toContain("grid-cols-1");
  });

  test("no tiene ninguna variante de dos columnas", () => {
    expect(clasesCamposFormulario).not.toContain("grid-cols-2");
  });

  test("no depende de ningun breakpoint de viewport ni de container", () => {
    expect(clasesCamposFormulario).not.toMatch(/\b(sm|md|lg|xl):/);
    expect(clasesCamposFormulario).not.toContain("@");
  });

  test("emite exactamente una clase de columnas", () => {
    expect(clasesCamposFormulario.match(/grid-cols-\S+/g) ?? []).toHaveLength(1);
  });

  test("conserva el grid y el gap que compartian los 3 formularios", () => {
    expect(clasesCamposFormulario).toMatch(/(^|\s)grid(\s|$)/);
    expect(clasesCamposFormulario).toContain("gap-4");
  });
});

/**
 * El grid EXTERNO de los 3 formularios (formulario | panel de riesgo) seguia
 * con `lg:grid-cols-2`, o sea una media query de viewport: exactamente el
 * patron del intento 1, el primero que fallo. Con el viewport reportado
 * inflado, en el telefono el formulario y el panel salen lado a lado y el
 * formulario queda aplastado a media pantalla.
 *
 * Se le aplica el mismo criterio que al grid de campos: apilar siempre, sin
 * decidir por ancho.
 */
describe("clasesLayoutFormulario", () => {
  test("declara una sola columna", () => {
    expect(clasesLayoutFormulario).toContain("grid-cols-1");
  });

  test("no tiene ninguna variante de dos columnas", () => {
    expect(clasesLayoutFormulario).not.toContain("grid-cols-2");
  });

  test("no depende de ningun breakpoint de viewport ni de container", () => {
    expect(clasesLayoutFormulario).not.toMatch(/\b(sm|md|lg|xl):/);
    expect(clasesLayoutFormulario).not.toContain("@");
  });

  test("emite exactamente una clase de columnas", () => {
    expect(clasesLayoutFormulario.match(/grid-cols-\S+/g) ?? []).toHaveLength(1);
  });

  test("conserva el grid y la separacion entre formulario y panel", () => {
    expect(clasesLayoutFormulario).toMatch(/(^|\s)grid(\s|$)/);
    expect(clasesLayoutFormulario).toContain("gap-6");
  });
});
