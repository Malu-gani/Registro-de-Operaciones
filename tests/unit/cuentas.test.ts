import { describe, expect, test } from "vitest";
import {
  comprometidoPorCuenta,
  costoOperacion,
  cuentaDePlazoFijo,
  cuentaDeTrade,
} from "@/utils/cuentas";
import type { PlazoFijo, Trade } from "@/types/trading";

function trade(over: Partial<Trade> = {}): Trade {
  return {
    id: "t1",
    portafolioId: "p1",
    activo: "AAPL",
    tipoActivo: "acciones",
    subTipoActivo: "usd",
    divisa: "USD",
    tipoOperacion: "long",
    fechaEntrada: "2026-07-01",
    precioEntrada: 100,
    cantidad: 10,
    estado: "abierta",
    ...over,
  };
}

function plazo(over: Partial<PlazoFijo> = {}): PlazoFijo {
  return {
    id: "pf1",
    portafolioId: "p1",
    monto: 1000,
    divisa: "ARS",
    tasaTna: 50,
    plazoDias: 30,
    fechaInicio: "2026-07-01",
    fechaVencimiento: "2026-07-31",
    interesEstimado: 41.09,
    estado: "pendiente",
    ...over,
  };
}

describe("cuentaDeTrade", () => {
  test.each([
    ["acciones", "usd", "usd"],
    ["acciones", "cedear", "ars"],
    ["crypto", "spot", "usdt_spot"],
    ["crypto", "futuros", "usdt_futuros"],
  ] as Array<[Trade["tipoActivo"], string, string]>)(
    "%s/%s va a la cuenta %s",
    (tipoActivo, subTipo, esperada) => {
      expect(
        cuentaDeTrade(trade({ tipoActivo, subTipoActivo: subTipo as Trade["subTipoActivo"] }))
      ).toBe(esperada);
    }
  );
});

describe("cuentaDePlazoFijo", () => {
  test("ARS va a la cuenta de pesos", () => {
    expect(cuentaDePlazoFijo(plazo({ divisa: "ARS" }))).toBe("ars");
  });

  test("USD va a la cuenta de dólares", () => {
    expect(cuentaDePlazoFijo(plazo({ divisa: "USD" }))).toBe("usd");
  });
});

describe("costoOperacion", () => {
  test("sin apalancamiento es cantidad por precio", () => {
    expect(costoOperacion(trade({ cantidad: 10, precioEntrada: 100 }))).toBe(1000);
  });

  test("con apalancamiento 10 el costo es el margen", () => {
    expect(
      costoOperacion(trade({ cantidad: 10, precioEntrada: 100, apalancamiento: 10 }))
    ).toBe(100);
  });

  test("apalancamiento 0 se trata como 1, no divide por cero", () => {
    expect(
      costoOperacion(trade({ cantidad: 10, precioEntrada: 100, apalancamiento: 0 }))
    ).toBe(1000);
  });
});

describe("comprometidoPorCuenta", () => {
  test("ignora las operaciones cerradas", () => {
    const totales = comprometidoPorCuenta(
      [
        trade({ id: "a", estado: "abierta" }),
        trade({ id: "b", estado: "cerrada", cantidad: 999 }),
      ],
      []
    );
    expect(totales.usd).toBe(1000);
  });

  test("suma los plazos fijos pendientes a su cuenta", () => {
    const totales = comprometidoPorCuenta([], [plazo({ monto: 5000, divisa: "ARS" })]);
    expect(totales.ars).toBe(5000);
  });

  test("no mezcla divisas entre cuentas", () => {
    const totales = comprometidoPorCuenta(
      [
        trade({ id: "a", tipoActivo: "acciones", subTipoActivo: "cedear", cantidad: 1, precioEntrada: 500 }),
        trade({ id: "b", tipoActivo: "crypto", subTipoActivo: "spot", cantidad: 2, precioEntrada: 300 }),
        trade({ id: "c", tipoActivo: "crypto", subTipoActivo: "futuros", cantidad: 10, precioEntrada: 100, apalancamiento: 5 }),
      ],
      [plazo({ monto: 700, divisa: "USD" })]
    );
    expect(totales).toEqual({
      ars: 500,
      usd: 700,
      usdt_spot: 600,
      usdt_futuros: 200,
    });
  });

  test("sin datos devuelve las cuatro cuentas en cero", () => {
    expect(comprometidoPorCuenta([], [])).toEqual({
      ars: 0,
      usd: 0,
      usdt_spot: 0,
      usdt_futuros: 0,
    });
  });
});
