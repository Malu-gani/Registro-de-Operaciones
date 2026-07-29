import { describe, expect, test } from "vitest";
import { reconstruirFIFO } from "@/lib/importExport/fifoReconstruction";
import type { MovimientoImportado } from "@/lib/importExport/universalOperation";

let fila = 0;

function mov(over: Partial<MovimientoImportado> = {}): MovimientoImportado {
  fila += 1;
  return {
    activo: "BTC",
    tipoActivo: "crypto",
    subTipoActivo: "spot",
    divisa: "USDT",
    lado: "compra",
    fecha: "2026-07-01",
    precio: 100,
    cantidad: 1,
    origen: "propio",
    filaOriginal: fila,
    ...over,
  } as MovimientoImportado;
}

describe("reconstruirFIFO — casos simples", () => {
  test("compra seguida de venta arma un long cerrado con su PnL", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "compra", fecha: "2026-07-01", precio: 100, cantidad: 2 }),
      mov({ lado: "venta", fecha: "2026-07-05", precio: 120, cantidad: 2 }),
    ]);

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      tipoOperacion: "long",
      estado: "cerrada",
      precioEntrada: 100,
      precioSalida: 120,
      cantidad: 2,
      fechaEntrada: "2026-07-01",
      fechaSalida: "2026-07-05",
    });
    expect(ops[0].pnlEstimado).toBeCloseTo(40, 6);
  });

  test("venta seguida de compra arma un short cerrado", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "venta", fecha: "2026-07-01", precio: 120, cantidad: 1 }),
      mov({ lado: "compra", fecha: "2026-07-05", precio: 100, cantidad: 1 }),
    ]);

    expect(ops).toHaveLength(1);
    expect(ops[0].tipoOperacion).toBe("short");
    expect(ops[0].estado).toBe("cerrada");
    expect(ops[0].pnlEstimado).toBeCloseTo(20, 6);
  });

  test("una compra sin venta queda como posición abierta", () => {
    const ops = reconstruirFIFO([mov({ lado: "compra", cantidad: 3 })]);

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ estado: "abierta", cantidad: 3, tipoOperacion: "long" });
    expect(ops[0].pnlEstimado).toBeUndefined();
  });
});

describe("reconstruirFIFO — cierres parciales y múltiples lotes", () => {
  test("una venta parcial cierra parte y deja el resto abierto", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "compra", fecha: "2026-07-01", precio: 100, cantidad: 5 }),
      mov({ lado: "venta", fecha: "2026-07-03", precio: 110, cantidad: 2 }),
    ]);

    const cerradas = ops.filter((o) => o.estado === "cerrada");
    const abiertas = ops.filter((o) => o.estado === "abierta");
    expect(cerradas).toHaveLength(1);
    expect(cerradas[0].cantidad).toBe(2);
    expect(abiertas).toHaveLength(1);
    expect(abiertas[0].cantidad).toBe(3);
  });

  test("una venta que consume dos lotes usa primero el más viejo", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "compra", fecha: "2026-07-01", precio: 100, cantidad: 1 }),
      mov({ lado: "compra", fecha: "2026-07-02", precio: 200, cantidad: 1 }),
      mov({ lado: "venta", fecha: "2026-07-03", precio: 300, cantidad: 2 }),
    ]);

    const cerradas = ops.filter((o) => o.estado === "cerrada");
    expect(cerradas).toHaveLength(2);
    // El primero en cerrarse es el lote más viejo (precio 100).
    expect(cerradas[0].precioEntrada).toBe(100);
    expect(cerradas[1].precioEntrada).toBe(200);
    const pnlTotal = cerradas.reduce((acc, o) => acc + (o.pnlEstimado ?? 0), 0);
    expect(pnlTotal).toBeCloseTo(300, 6);
  });

  test("las ejecuciones se ordenan por fecha aunque vengan desordenadas", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "venta", fecha: "2026-07-05", precio: 120, cantidad: 1 }),
      mov({ lado: "compra", fecha: "2026-07-01", precio: 100, cantidad: 1 }),
    ]);

    expect(ops).toHaveLength(1);
    expect(ops[0].tipoOperacion).toBe("long");
    expect(ops[0].fechaEntrada).toBe("2026-07-01");
  });
});

describe("reconstruirFIFO — vuelta de posición", () => {
  test("una venta mayor al inventario cierra el long y abre un short", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "compra", fecha: "2026-07-01", precio: 100, cantidad: 1 }),
      mov({ lado: "venta", fecha: "2026-07-02", precio: 120, cantidad: 3 }),
    ]);

    const cerradas = ops.filter((o) => o.estado === "cerrada");
    const abiertas = ops.filter((o) => o.estado === "abierta");
    expect(cerradas).toHaveLength(1);
    expect(cerradas[0].tipoOperacion).toBe("long");
    expect(cerradas[0].cantidad).toBe(1);
    expect(abiertas).toHaveLength(1);
    expect(abiertas[0].tipoOperacion).toBe("short");
    expect(abiertas[0].cantidad).toBe(2);
  });
});

describe("reconstruirFIFO — separación por libro", () => {
  test("activos distintos no se emparejan entre sí", () => {
    const ops = reconstruirFIFO([
      mov({ activo: "BTC", lado: "compra", cantidad: 1 }),
      mov({ activo: "ETH", lado: "venta", cantidad: 1 }),
    ]);

    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.estado === "abierta")).toBe(true);
  });

  test("el mismo activo en distinta divisa no se empareja", () => {
    const ops = reconstruirFIFO([
      mov({ activo: "AAPL", divisa: "USD", lado: "compra", cantidad: 1 }),
      mov({ activo: "AAPL", divisa: "ARS", lado: "venta", cantidad: 1 }),
    ]);

    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.estado === "abierta")).toBe(true);
  });

  test("cada operación registra las filas del archivo que la originaron", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "compra", fecha: "2026-07-01", filaOriginal: 7 }),
      mov({ lado: "venta", fecha: "2026-07-02", filaOriginal: 9 }),
    ]);

    expect(ops[0].filasOrigen).toEqual([7, 9]);
  });
});
