import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useListaPaginada } from "@/components/ListaPaginada";

const items = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("useListaPaginada con conMinimizar (historiales)", () => {
  test("con 40 ítems arranca colapsado en 5, sin paginador", () => {
    const { result } = renderHook(() =>
      useListaPaginada(items(40), { conMinimizar: true })
    );

    expect(result.current.visibles).toHaveLength(5);
    expect(result.current.mostrarVerMas).toBe(true);
    expect(result.current.mostrarPaginador).toBe(false);
    expect(result.current.mostrarMinimizar).toBe(false);
    expect(result.current.totalCount).toBe(40);
  });

  test("al maximizar pagina de a 10 y ofrece minimizar", () => {
    const { result } = renderHook(() =>
      useListaPaginada(items(40), { conMinimizar: true })
    );

    act(() => result.current.verMas());

    expect(result.current.visibles).toHaveLength(10);
    expect(result.current.mostrarPaginador).toBe(true);
    expect(result.current.mostrarMinimizar).toBe(true);
    expect(result.current.totalPaginas).toBe(4);
  });

  test("navegar a la página 3 muestra el bloque correcto", () => {
    const { result } = renderHook(() =>
      useListaPaginada(items(40), { conMinimizar: true })
    );

    act(() => result.current.verMas());
    act(() => result.current.irAPagina(3));

    expect(result.current.pagina).toBe(3);
    expect(result.current.visibles[0]).toBe(21);
    expect(result.current.visibles.at(-1)).toBe(30);
  });

  test("minimizar vuelve a 5 ítems y resetea a la página 1", () => {
    const { result } = renderHook(() =>
      useListaPaginada(items(40), { conMinimizar: true })
    );

    act(() => result.current.verMas());
    act(() => result.current.irAPagina(3));
    act(() => result.current.colapsar());

    expect(result.current.visibles).toHaveLength(5);
    expect(result.current.pagina).toBe(1);
    expect(result.current.mostrarVerMas).toBe(true);
  });

  test.each([
    [5, 5, false],
    [6, 5, true],
    [10, 5, true],
    [11, 5, true],
  ])(
    "con %d ítems muestra %d y verMas=%s en el estado inicial",
    (total, visibles, verMas) => {
      const { result } = renderHook(() =>
        useListaPaginada(items(total), { conMinimizar: true })
      );

      expect(result.current.visibles).toHaveLength(visibles);
      expect(result.current.mostrarVerMas).toBe(verMas);
    }
  );

  test("con 6 ítems, maximizar los muestra todos y ofrece minimizar", () => {
    const { result } = renderHook(() =>
      useListaPaginada(items(6), { conMinimizar: true })
    );

    act(() => result.current.verMas());

    expect(result.current.visibles).toHaveLength(6);
    expect(result.current.mostrarPaginador).toBe(false);
    expect(result.current.mostrarMinimizar).toBe(true);
  });

  test("con 11 ítems, maximizar activa el paginador de 2 páginas", () => {
    const { result } = renderHook(() =>
      useListaPaginada(items(11), { conMinimizar: true })
    );

    act(() => result.current.verMas());

    expect(result.current.totalPaginas).toBe(2);
    expect(result.current.visibles).toHaveLength(10);
  });
});

describe("useListaPaginada sin conMinimizar (modo simple)", () => {
  test("con 5 ítems no muestra ningún control", () => {
    const { result } = renderHook(() => useListaPaginada(items(5)));

    expect(result.current.visibles).toHaveLength(5);
    expect(result.current.mostrarVerMas).toBe(false);
    expect(result.current.mostrarPaginador).toBe(false);
    expect(result.current.mostrarMinimizar).toBe(false);
  });

  test("con 8 ítems colapsa en 5 y ofrece maximizar sin minimizar", () => {
    const { result } = renderHook(() => useListaPaginada(items(8)));

    expect(result.current.mostrarVerMas).toBe(true);

    act(() => result.current.verMas());

    expect(result.current.visibles).toHaveLength(8);
    expect(result.current.mostrarMinimizar).toBe(false);
  });

  test("con 25 ítems pagina directo, sin pasar por el colapsado", () => {
    const { result } = renderHook(() => useListaPaginada(items(25)));

    expect(result.current.mostrarPaginador).toBe(true);
    expect(result.current.visibles).toHaveLength(10);
    expect(result.current.mostrarMinimizar).toBe(false);
  });
});
