import { describe, expect, test } from "vitest";
import { crearUsuarioDePrueba, disponibleDe, type UsuarioDePrueba } from "../setup/usuarios";

/** Parámetros de una operación de acciones USD, sobreescribibles por test. */
function params(u: UsuarioDePrueba, over: Record<string, unknown> = {}) {
  return {
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
  };
}

async function conSaldo(cuenta: string, monto: number) {
  const u = await crearUsuarioDePrueba();
  await u.client.rpc("set_saldo_inicial", {
    p_portafolio_id: u.portafolioId,
    p_cuenta: cuenta,
    p_monto: monto,
  });
  return u;
}

describe("abrir_operacion — camino feliz", () => {
  test("descuenta exactamente cantidad x precio de la cuenta USD", async () => {
    const u = await conSaldo("usd", 5000);

    const { data: opId, error } = await u.client.rpc("abrir_operacion", params(u));

    expect(error).toBeNull();
    expect(opId).toBeTruthy();
    expect(await disponibleDe(u, "usd")).toBe(4000);
  });

  test("deja la operación abierta con sus datos", async () => {
    const u = await conSaldo("usd", 5000);
    const { data: opId } = await u.client.rpc("abrir_operacion", params(u));

    const { data: op } = await u.client
      .from("operaciones")
      .select("estado, cantidad, precio_entrada, activo")
      .eq("id", opId)
      .single();

    expect(op).toMatchObject({ estado: "abierta", activo: "AAPL" });
    expect(Number(op?.cantidad)).toBe(10);
  });

  test("registra un movimiento de apertura con monto negativo", async () => {
    const u = await conSaldo("usd", 5000);
    const { data: opId } = await u.client.rpc("abrir_operacion", params(u));

    const { data: mov } = await u.client
      .from("movimientos_cuenta")
      .select("tipo, monto, ref_operacion_id")
      .eq("tipo", "apertura")
      .single();

    expect(Number(mov?.monto)).toBe(-1000);
    expect(mov?.ref_operacion_id).toBe(opId);
  });

  test("en futuros descuenta el margen, no el nocional", async () => {
    const u = await conSaldo("usdt_futuros", 5000);

    await u.client.rpc(
      "abrir_operacion",
      params(u, {
        p_tipo_activo: "crypto",
        p_sub_tipo_activo: "futuros",
        p_divisa: "USDT",
        p_apalancamiento: 10,
        p_activo: "BTC",
      })
    );

    // cantidad 10 x precio 100 / apalancamiento 10 = 100 de margen.
    expect(await disponibleDe(u, "usdt_futuros")).toBe(4900);
  });

  test.each([
    ["acciones", "usd", "usd", "USD"],
    ["acciones", "cedear", "ars", "ARS"],
    ["crypto", "spot", "usdt_spot", "USDT"],
    ["crypto", "futuros", "usdt_futuros", "USDT"],
  ])(
    "%s/%s debita la cuenta %s",
    async (tipoActivo, subTipo, cuenta, divisa) => {
      const u = await conSaldo(cuenta, 5000);

      await u.client.rpc(
        "abrir_operacion",
        params(u, {
          p_tipo_activo: tipoActivo,
          p_sub_tipo_activo: subTipo,
          p_divisa: divisa,
          p_apalancamiento: null,
        })
      );

      expect(await disponibleDe(u, cuenta)).toBe(4000);
    }
  );
});

describe("abrir_operacion — atomicidad", () => {
  test("sin fondos falla y no deja operación, movimiento ni cambio de saldo", async () => {
    const u = await conSaldo("usd", 500);

    const { error } = await u.client.rpc("abrir_operacion", params(u));

    expect(error?.message).toMatch(/FONDOS_INSUFICIENTES:usd/);
    expect(await disponibleDe(u, "usd")).toBe(500);

    const { data: ops } = await u.client.from("operaciones").select("id");
    expect(ops).toHaveLength(0);

    const { data: movs } = await u.client
      .from("movimientos_cuenta")
      .select("id")
      .eq("tipo", "apertura");
    expect(movs).toHaveLength(0);
  });

  test("sin saldo cargado en la cuenta se comporta como saldo cero", async () => {
    const u = await crearUsuarioDePrueba();

    const { error } = await u.client.rpc("abrir_operacion", params(u));

    expect(error?.message).toMatch(/FONDOS_INSUFICIENTES:usd/);
  });
});

describe("abrir_operacion — validaciones", () => {
  test("rechaza una fecha de entrada futura", async () => {
    const u = await conSaldo("usd", 5000);
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const { error } = await u.client.rpc(
      "abrir_operacion",
      params(u, { p_fecha_entrada: manana })
    );

    expect(error?.message).toMatch(/FECHA_FUTURA/);
    expect(await disponibleDe(u, "usd")).toBe(5000);
  });

  // Defecto 9.1 de docs/testing.md — P0, ARREGLADO en la migración 015. Con cantidad
  // negativa, v_costo daba negativo, la guarda de fondos pasaba siempre, y
  // `disponible - v_costo` SUMABA al saldo (1.000 USD → 101.000 medido). La RPC
  // es security definer y está otorgada a `authenticated`: cualquier usuario
  // logueado la llama directo, sin pasar por el formulario.
  test("rechaza una cantidad negativa en vez de acreditar saldo", async () => {
    const u = await conSaldo("usd", 1000);

    const { error } = await u.client.rpc(
      "abrir_operacion",
      params(u, { p_cantidad: -1000 })
    );

    expect(error?.message).toMatch(/MONTO_INVALIDO/);
    expect(await disponibleDe(u, "usd")).toBe(1000);
  });

  test("rechaza un precio de entrada negativo", async () => {
    const u = await conSaldo("usd", 1000);

    const { error } = await u.client.rpc(
      "abrir_operacion",
      params(u, { p_precio_entrada: -100 })
    );

    expect(error?.message).toMatch(/MONTO_INVALIDO/);
    expect(await disponibleDe(u, "usd")).toBe(1000);
  });

  test("rechaza una cantidad de cero", async () => {
    const u = await conSaldo("usd", 1000);

    const { error } = await u.client.rpc("abrir_operacion", params(u, { p_cantidad: 0 }));

    expect(error?.message).toMatch(/MONTO_INVALIDO/);
  });
});

/**
 * La guarda de la RPC protege de llamar `abrir_operacion` con basura; estos
 * checks protegen de CUALQUIER vía de escritura, incluidas las que todavía no
 * existen. Es la capa que ya tenía `plazos_fijos` y que evitó que el defecto
 * 9.2 fuera un P0 (migración 015).
 */
describe("operaciones — checks de columna", () => {
  async function insertar(u: UsuarioDePrueba, over: Record<string, unknown>) {
    return u.client.from("operaciones").insert({
      portafolio_id: u.portafolioId,
      activo: "AAPL",
      tipo_activo: "acciones",
      sub_tipo_activo: "usd",
      divisa: "USD",
      tipo_operacion: "long",
      fecha_entrada: "2026-07-01",
      precio_entrada: 100,
      cantidad: 10,
      estado: "abierta",
      ...over,
    });
  }

  test("rechaza el insert directo de una cantidad no positiva", async () => {
    const u = await crearUsuarioDePrueba();

    const { error } = await insertar(u, { cantidad: -5 });

    expect(error?.message).toMatch(/operaciones_cantidad_check/);
  });

  test("rechaza el insert directo de un precio de entrada no positivo", async () => {
    const u = await crearUsuarioDePrueba();

    const { error } = await insertar(u, { precio_entrada: 0 });

    expect(error?.message).toMatch(/operaciones_precio_entrada_check/);
  });

  test("rechaza un precio de salida no positivo, pero acepta que sea nulo", async () => {
    const u = await crearUsuarioDePrueba();

    const { error: conSalidaInvalida } = await insertar(u, {
      estado: "cerrada",
      fecha_salida: "2026-07-05",
      precio_salida: -1000,
    });
    expect(conSalidaInvalida?.message).toMatch(/operaciones_precio_salida_check/);

    // Una operación abierta no tiene precio de salida: el check no la molesta.
    const { error: abierta } = await insertar(u, { precio_salida: null });
    expect(abierta).toBeNull();
  });
});
