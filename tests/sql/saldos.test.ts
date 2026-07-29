import { describe, expect, test } from "vitest";
import { crearUsuarioDePrueba, disponibleDe } from "../setup/usuarios";

describe("set_saldo_inicial", () => {
  test("fija el disponible y deja un movimiento de ajuste inicial", async () => {
    const u = await crearUsuarioDePrueba();

    const { error } = await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_monto: 100000,
    });

    expect(error).toBeNull();
    expect(await disponibleDe(u, "ars")).toBe(100000);

    const { data: movs } = await u.client
      .from("movimientos_cuenta")
      .select("tipo, monto")
      .eq("portafolio_id", u.portafolioId);

    expect(movs).toHaveLength(1);
    expect(movs?.[0].tipo).toBe("ajuste_inicial");
    expect(Number(movs?.[0].monto)).toBe(100000);
  });

  test("volver a fijarlo reemplaza el disponible, no lo suma", async () => {
    const u = await crearUsuarioDePrueba();

    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usd",
      p_monto: 500,
    });
    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usd",
      p_monto: 800,
    });

    expect(await disponibleDe(u, "usd")).toBe(800);
  });

  test("rechaza un monto negativo", async () => {
    const u = await crearUsuarioDePrueba();

    const { error } = await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_monto: -100,
    });

    expect(error?.message).toMatch(/MONTO_INVALIDO/);
    expect(await disponibleDe(u, "ars")).toBe(0);
  });
});

describe("registrar_movimiento_cuenta", () => {
  async function conSaldo(cuenta: string, monto: number) {
    const u = await crearUsuarioDePrueba();
    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: cuenta,
      p_monto: monto,
    });
    return u;
  }

  test("un depósito suma al disponible", async () => {
    const u = await conSaldo("ars", 1000);

    const { error } = await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_tipo: "deposito",
      p_monto: 500,
      p_fecha: "2026-07-01",
      p_notas: "Depósito de prueba",
    });

    expect(error).toBeNull();
    expect(await disponibleDe(u, "ars")).toBe(1500);
  });

  test("un retiro resta del disponible y se guarda con signo negativo", async () => {
    const u = await conSaldo("ars", 1000);

    await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_tipo: "retiro",
      p_monto: 300,
      p_fecha: "2026-07-01",
      p_notas: null,
    });

    expect(await disponibleDe(u, "ars")).toBe(700);

    const { data: movs } = await u.client
      .from("movimientos_cuenta")
      .select("tipo, monto")
      .eq("tipo", "retiro");

    expect(Number(movs?.[0].monto)).toBe(-300);
  });

  test("un retiro mayor al disponible falla y no deja rastro", async () => {
    const u = await conSaldo("ars", 100);

    const { error } = await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_tipo: "retiro",
      p_monto: 500,
      p_fecha: "2026-07-01",
      p_notas: null,
    });

    expect(error?.message).toMatch(/FONDOS_INSUFICIENTES:ars/);
    expect(await disponibleDe(u, "ars")).toBe(100);

    const { data: movs } = await u.client
      .from("movimientos_cuenta")
      .select("tipo")
      .eq("tipo", "retiro");

    expect(movs).toHaveLength(0);
  });

  test("rechaza un tipo de movimiento inválido", async () => {
    const u = await conSaldo("ars", 1000);

    const { error } = await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_tipo: "transferencia",
      p_monto: 100,
      p_fecha: "2026-07-01",
      p_notas: null,
    });

    expect(error?.message).toMatch(/TIPO_INVALIDO/);
  });

  test("rechaza un monto de cero o negativo", async () => {
    const u = await conSaldo("ars", 1000);

    for (const monto of [0, -50]) {
      const { error } = await u.client.rpc("registrar_movimiento_cuenta", {
        p_portafolio_id: u.portafolioId,
        p_cuenta: "ars",
        p_tipo: "deposito",
        p_monto: monto,
        p_fecha: "2026-07-01",
        p_notas: null,
      });
      expect(error?.message).toMatch(/MONTO_INVALIDO/);
    }

    expect(await disponibleDe(u, "ars")).toBe(1000);
  });

  test("rechaza una fecha futura", async () => {
    const u = await conSaldo("ars", 1000);
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const { error } = await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_tipo: "deposito",
      p_monto: 100,
      p_fecha: manana,
      p_notas: null,
    });

    expect(error?.message).toMatch(/FECHA_FUTURA/);
  });
});
