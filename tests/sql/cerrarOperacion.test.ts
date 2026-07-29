import { describe, expect, test } from "vitest";
import { crearUsuarioDePrueba, disponibleDe } from "../setup/usuarios";

async function conOperacionAbierta(over: Record<string, unknown> = {}) {
  const u = await crearUsuarioDePrueba();
  await u.client.rpc("set_saldo_inicial", {
    p_portafolio_id: u.portafolioId,
    p_cuenta: "usd",
    p_monto: 5000,
  });

  const { data: opId } = await u.client.rpc("abrir_operacion", {
    p_portafolio_id: u.portafolioId,
    p_activo: "AAPL",
    p_tipo_activo: "acciones",
    p_sub_tipo_activo: "usd",
    p_divisa: "USD",
    p_apalancamiento: null,
    p_tipo_operacion: "long",
    p_fecha_entrada: "2026-07-01",
    p_precio_entrada: 100,
    p_precio_stop_loss: 90,
    p_precio_take_profit: 130,
    p_cantidad: 10,
    p_ratio_riesgo_beneficio: 3,
    p_porcentaje_riesgo: 10,
    p_notas: null,
    ...over,
  });

  return { u, opId: opId as string };
}

describe("cerrar_operacion — cierre total", () => {
  test("acredita costo + P&L y marca la operación cerrada", async () => {
    const { u, opId } = await conOperacionAbierta();
    // Tras abrir: 5000 - 1000 = 4000 disponible.

    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });

    expect(error).toBeNull();
    // proceeds = costo 1000 + pnl 200 = 1200. 4000 + 1200 = 5200.
    expect(await disponibleDe(u, "usd")).toBe(5200);

    const { data: op } = await u.client
      .from("operaciones")
      .select("estado, resultado_pnl, precio_salida")
      .eq("id", opId)
      .single();

    expect(op?.estado).toBe("cerrada");
    expect(Number(op?.resultado_pnl)).toBe(200);
  });

  test("una operación perdedora acredita menos que el costo", async () => {
    const { u, opId } = await conOperacionAbierta();

    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 80,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });

    // proceeds = 1000 + (-200) = 800. 4000 + 800 = 4800.
    expect(await disponibleDe(u, "usd")).toBe(4800);
  });

  test("un short gana cuando el precio baja", async () => {
    const u = await crearUsuarioDePrueba();
    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usdt_futuros",
      p_monto: 5000,
    });
    const { data: opId } = await u.client.rpc("abrir_operacion", {
      p_portafolio_id: u.portafolioId,
      p_activo: "BTC",
      p_tipo_activo: "crypto",
      p_sub_tipo_activo: "futuros",
      p_divisa: "USDT",
      p_apalancamiento: 10,
      p_tipo_operacion: "short",
      p_fecha_entrada: "2026-07-01",
      p_precio_entrada: 100,
      p_precio_stop_loss: 110,
      p_precio_take_profit: 80,
      p_cantidad: 10,
      p_ratio_riesgo_beneficio: 2,
      p_porcentaje_riesgo: 1,
      p_notas: null,
    });

    // margen = 10 x 100 / 10 = 100. Disponible tras abrir: 4900.
    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 80,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });

    // pnl = (100 - 80) x 10 = 200. proceeds = margen 100 + 200 = 300.
    expect(await disponibleDe(u, "usdt_futuros")).toBe(5200);
  });
});

describe("cerrar_operacion — cierre parcial", () => {
  test("reduce la original y crea una fila cerrada por la porción", async () => {
    const { u, opId } = await conOperacionAbierta();

    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 4,
    });

    const { data: original } = await u.client
      .from("operaciones")
      .select("estado, cantidad")
      .eq("id", opId)
      .single();

    expect(original?.estado).toBe("abierta");
    expect(Number(original?.cantidad)).toBe(6);

    const { data: cerradas } = await u.client
      .from("operaciones")
      .select("cantidad, resultado_pnl")
      .eq("estado", "cerrada");

    expect(cerradas).toHaveLength(1);
    expect(Number(cerradas?.[0].cantidad)).toBe(4);
    expect(Number(cerradas?.[0].resultado_pnl)).toBe(80);
  });

  test("acredita solo la porción cerrada", async () => {
    const { u, opId } = await conOperacionAbierta();

    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 4,
    });

    // proceeds = costo 400 + pnl 80 = 480. 4000 + 480 = 4480.
    expect(await disponibleDe(u, "usd")).toBe(4480);
  });

  test("cerrar el resto deja la operación original cerrada", async () => {
    const { u, opId } = await conOperacionAbierta();

    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 4,
    });
    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-11",
      p_cantidad_cerrada: 6,
    });

    const { data: op } = await u.client
      .from("operaciones")
      .select("estado")
      .eq("id", opId)
      .single();

    expect(op?.estado).toBe("cerrada");
    // El total acreditado equivale a haber cerrado todo de una: 5200.
    expect(await disponibleDe(u, "usd")).toBe(5200);
  });
});

describe("cerrar_operacion — validaciones", () => {
  test("rechaza cerrar dos veces la misma operación", async () => {
    const { u, opId } = await conOperacionAbierta();

    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });
    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });

    expect(error?.message).toMatch(/OPERACION_YA_CERRADA/);
    expect(await disponibleDe(u, "usd")).toBe(5200);
  });

  test.each([0, -5, 11])("rechaza cerrar una cantidad de %d", async (cantidad) => {
    const { u, opId } = await conOperacionAbierta();

    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: cantidad,
    });

    expect(error?.message).toMatch(/CANTIDAD_INVALIDA/);
    expect(await disponibleDe(u, "usd")).toBe(4000);
  });

  test("rechaza una operación inexistente", async () => {
    const { u } = await conOperacionAbierta();

    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: "00000000-0000-0000-0000-000000000000",
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 1,
    });

    expect(error?.message).toMatch(/OPERACION_NO_ENCONTRADA/);
  });

  test("rechaza una fecha de salida futura", async () => {
    const { u, opId } = await conOperacionAbierta();
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: manana,
      p_cantidad_cerrada: 10,
    });

    expect(error?.message).toMatch(/FECHA_FUTURA/);
  });

  // Defecto 9.4 del spec, ARREGLADO en la migración 016: solo validaba contra
  // current_date, nunca contra op.fecha_entrada, así que permitía cerrar una
  // operación antes de haberla abierto.
  test("rechaza una fecha de salida anterior a la de entrada", async () => {
    const { u, opId } = await conOperacionAbierta();

    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-06-01", // la entrada fue el 2026-07-01
      p_cantidad_cerrada: 10,
    });

    expect(error?.message).toMatch(/FECHA_INVALIDA/);
  });

  // El borde de esa guarda: cerrar el mismo día que se abrió es legítimo (un
  // intradía) y tiene que seguir funcionando.
  test("acepta cerrar el mismo día en que se abrió", async () => {
    const { u, opId } = await conOperacionAbierta();

    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-01", // la misma fecha de entrada
      p_cantidad_cerrada: 10,
    });

    expect(error).toBeNull();
    expect(await disponibleDe(u, "usd")).toBe(5200);
  });

  // Defecto 9.5 del spec — P0, ARREGLADO en la migración 015. Sin guarda sobre
  // p_precio_salida: en un short, (precio_entrada - p_precio_salida) con salida
  // negativa inflaba el P&L y acreditaba ese monto inexistente al disponible;
  // en un long lo dejaba NEGATIVO, rompiendo la invariante `disponible >= 0`.
  test("rechaza un precio de salida negativo", async () => {
    const { u, opId } = await conOperacionAbierta();

    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: -1000,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });

    expect(error?.message).toMatch(/MONTO_INVALIDO/);
    expect(await disponibleDe(u, "usd")).toBe(4000);
  });
});
