import { describe, expect, test } from "vitest";
import { claveOperacion, marcarDuplicados } from "@/lib/importExport/dedup";
import type { OperacionReconstruida } from "@/lib/importExport/fifoReconstruction";
import type { Trade } from "@/types/trading";

function op(over: Partial<OperacionReconstruida> = {}): OperacionReconstruida {
  return {
    activo: "BTC",
    tipoActivo: "crypto",
    subTipoActivo: "spot",
    divisa: "USDT",
    tipoOperacion: "long",
    fechaEntrada: "2026-07-01",
    precioEntrada: 100,
    cantidad: 1,
    estado: "cerrada",
    fechaSalida: "2026-07-05",
    precioSalida: 120,
    filasOrigen: [1, 2],
    ...over,
  };
}

function existente(over: Partial<Trade> = {}): Trade {
  return {
    id: "t1",
    portafolioId: "p1",
    activo: "BTC",
    tipoActivo: "crypto",
    subTipoActivo: "spot",
    divisa: "USDT",
    tipoOperacion: "long",
    fechaEntrada: "2026-07-01",
    precioEntrada: 100,
    cantidad: 1,
    estado: "cerrada",
    fechaSalida: "2026-07-05",
    precioSalida: 120,
    ...over,
  };
}

describe("claveOperacion", () => {
  test("dos operaciones idénticas tienen la misma firma", () => {
    expect(claveOperacion(op())).toBe(claveOperacion(op()));
  });

  test("tolera diferencias de coma flotante", () => {
    expect(claveOperacion(op({ precioEntrada: 100 }))).toBe(
      claveOperacion(op({ precioEntrada: 100.000000001 }))
    );
  });

  test("una abierta y una cerrada del mismo lote NO comparten firma", () => {
    const abierta = op({ estado: "abierta", fechaSalida: undefined, precioSalida: undefined });
    expect(claveOperacion(abierta)).not.toBe(claveOperacion(op()));
  });

  test("distinto precio de salida da distinta firma", () => {
    expect(claveOperacion(op({ precioSalida: 130 }))).not.toBe(claveOperacion(op()));
  });
});

describe("marcarDuplicados", () => {
  test("marca la que ya existe en el portafolio destino", () => {
    expect(marcarDuplicados([op()], [existente()])).toEqual([true]);
  });

  test("no marca una operación nueva", () => {
    expect(marcarDuplicados([op({ precioEntrada: 999 })], [existente()])).toEqual([false]);
  });

  test("marca la segunda aparición dentro del mismo archivo", () => {
    expect(marcarDuplicados([op(), op()], [])).toEqual([false, true]);
  });

  test("sin operaciones existentes, un archivo sin repetidos no marca nada", () => {
    const ops = [op({ activo: "BTC" }), op({ activo: "ETH" }), op({ activo: "SOL" })];
    expect(marcarDuplicados(ops, [])).toEqual([false, false, false]);
  });

  test("devuelve un booleano por cada operación, en el mismo orden", () => {
    const ops = [op({ activo: "BTC" }), op({ activo: "ETH" }), op({ activo: "BTC" })];
    expect(marcarDuplicados(ops, [])).toEqual([false, false, true]);
  });
});
