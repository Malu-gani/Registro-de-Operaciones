import { describe, expect, test } from "vitest";
import {
  admiteOperacion,
  cuentasDeMercado,
  type TipoOperacionForm,
} from "@/utils/tipoMercado";
import type { TipoMercadoPortafolio } from "@/types/trading";

/** Matriz completa: 3 tipos de mercado x 3 tipos de operación. */
const MATRIZ: Array<[TipoMercadoPortafolio, TipoOperacionForm, boolean]> = [
  ["acciones", "acciones", true],
  ["acciones", "plazo-fijo", true],
  ["acciones", "crypto", false],
  ["cripto", "crypto", true],
  ["cripto", "acciones", false],
  ["cripto", "plazo-fijo", false],
  ["mixto", "acciones", true],
  ["mixto", "crypto", true],
  ["mixto", "plazo-fijo", true],
];

describe("admiteOperacion", () => {
  test.each(MATRIZ)("portafolio %s con operación %s -> %s", (tipo, op, esperado) => {
    expect(admiteOperacion(tipo, op)).toBe(esperado);
  });
});

describe("cuentasDeMercado", () => {
  test("un portafolio de acciones solo habilita ARS y USD", () => {
    expect(cuentasDeMercado("acciones")).toEqual(["ars", "usd"]);
  });

  test("un portafolio de cripto solo habilita las billeteras USDT", () => {
    expect(cuentasDeMercado("cripto")).toEqual(["usdt_spot", "usdt_futuros"]);
  });

  test("un portafolio mixto habilita las cuatro cuentas", () => {
    expect(cuentasDeMercado("mixto")).toHaveLength(4);
  });
});
