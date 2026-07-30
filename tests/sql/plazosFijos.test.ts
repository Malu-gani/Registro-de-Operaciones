import { describe, expect, test } from "vitest";
import { crearUsuarioDePrueba, disponibleDe, type UsuarioDePrueba } from "../setup/usuarios";

async function conSaldoARS(monto = 100000) {
  const u = await crearUsuarioDePrueba();
  await u.client.rpc("set_saldo_inicial", {
    p_portafolio_id: u.portafolioId,
    p_cuenta: "ars",
    p_monto: monto,
  });
  return u;
}

function paramsPlazo(u: UsuarioDePrueba, over: Record<string, unknown> = {}) {
  return {
    p_portafolio_id: u.portafolioId,
    p_monto: 50000,
    p_divisa: "ARS",
    p_tasa_tna: 73,
    p_plazo_dias: 30,
    p_fecha_inicio: "2026-07-01",
    p_fecha_vencimiento: "2026-07-31",
    p_interes_estimado: 3000,
    p_notas: null,
    ...over,
  };
}

describe("abrir_plazo_fijo", () => {
  test("debita el monto de la cuenta de la divisa", async () => {
    const u = await conSaldoARS();

    const { data: id, error } = await u.client.rpc("abrir_plazo_fijo", paramsPlazo(u));

    expect(error).toBeNull();
    expect(id).toBeTruthy();
    expect(await disponibleDe(u, "ars")).toBe(50000);
  });

  test("deja el plazo en estado pendiente y su movimiento de apertura", async () => {
    const u = await conSaldoARS();
    const { data: id } = await u.client.rpc("abrir_plazo_fijo", paramsPlazo(u));

    const { data: pf } = await u.client
      .from("plazos_fijos")
      .select("estado, monto")
      .eq("id", id)
      .single();
    expect(pf?.estado).toBe("pendiente");

    const { data: mov } = await u.client
      .from("movimientos_cuenta")
      .select("tipo, monto, ref_operacion_id")
      .eq("tipo", "plazo_apertura")
      .single();
    expect(Number(mov?.monto)).toBe(-50000);
    expect(mov?.ref_operacion_id).toBe(id);
  });

  test("un plazo en USD debita la cuenta de dólares", async () => {
    const u = await crearUsuarioDePrueba();
    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usd",
      p_monto: 1000,
    });

    await u.client.rpc(
      "abrir_plazo_fijo",
      paramsPlazo(u, { p_divisa: "USD", p_monto: 400, p_interes_estimado: 20 })
    );

    expect(await disponibleDe(u, "usd")).toBe(600);
  });

  test("sin fondos falla y no deja plazo ni movimiento", async () => {
    const u = await conSaldoARS(1000);

    const { error } = await u.client.rpc("abrir_plazo_fijo", paramsPlazo(u));

    expect(error?.message).toMatch(/FONDOS_INSUFICIENTES:ars/);
    expect(await disponibleDe(u, "ars")).toBe(1000);

    const { data: plazos } = await u.client.from("plazos_fijos").select("id");
    expect(plazos).toHaveLength(0);
  });

  // Defecto 9.2 — REVISADO el 2026-07-29 al correrlo contra la base real.
  //
  // El spec lo daba como P0 gemelo del 9.1 (creación de dinero). NO lo es: la
  // tabla plazos_fijos tiene `check (monto > 0)` (migración 003), así que el
  // INSERT falla, la transacción se revierte entera y el saldo queda intacto.
  // La RPC es igual de descuidada que abrir_operacion —no valida el parámetro—
  // pero acá la base la salva. La diferencia es que operaciones.cantidad y
  // operaciones.precio_entrada NO tienen ese check.
  //
  // Lo que sigue mal es la CALIDAD del rechazo, no el rechazo en sí. Por eso
  // van dos tests separados: uno que fija el comportamiento financiero (pasa
  // hoy y tiene que seguir pasando) y otro que documenta lo que falta.
  test("un monto negativo NO crea dinero: se rechaza y no deja rastro", async () => {
    const u = await conSaldoARS(1000);

    const { error } = await u.client.rpc(
      "abrir_plazo_fijo",
      paramsPlazo(u, { p_monto: -100000 })
    );

    expect(error).not.toBeNull();
    expect(await disponibleDe(u, "ars")).toBe(1000);

    const { data: plazos } = await u.client.from("plazos_fijos").select("id");
    expect(plazos).toHaveLength(0);
  });

  // Defecto 9.2 de docs/testing.md — P3, ARREGLADO en la migración 015.
  test("rechaza el monto negativo con MONTO_INVALIDO y no con un error crudo de Postgres", async () => {
    const u = await conSaldoARS(1000);

    const { error } = await u.client.rpc(
      "abrir_plazo_fijo",
      paramsPlazo(u, { p_monto: -100000 })
    );

    // Antes devolvía: violates check constraint "plazos_fijos_monto_check",
    // que la app no puede traducir a un mensaje para el usuario.
    expect(error?.message).toMatch(/MONTO_INVALIDO/);
  });
});

describe("liquidar_plazo_fijo", () => {
  test("acredita monto + interés y marca el plazo liquidado", async () => {
    const u = await conSaldoARS();
    const { data: id } = await u.client.rpc("abrir_plazo_fijo", paramsPlazo(u));

    const { error } = await u.client.rpc("liquidar_plazo_fijo", { p_id: id });

    expect(error).toBeNull();
    // 50000 restante + 50000 capital + 3000 interés.
    expect(await disponibleDe(u, "ars")).toBe(103000);

    const { data: pf } = await u.client
      .from("plazos_fijos")
      .select("estado")
      .eq("id", id)
      .single();
    expect(pf?.estado).toBe("liquidado");
  });

  test("rechaza liquidar dos veces", async () => {
    const u = await conSaldoARS();
    const { data: id } = await u.client.rpc("abrir_plazo_fijo", paramsPlazo(u));

    await u.client.rpc("liquidar_plazo_fijo", { p_id: id });
    const { error } = await u.client.rpc("liquidar_plazo_fijo", { p_id: id });

    expect(error?.message).toMatch(/PLAZO_YA_LIQUIDADO/);
    expect(await disponibleDe(u, "ars")).toBe(103000);
  });

  test("rechaza un plazo inexistente", async () => {
    const u = await conSaldoARS();

    const { error } = await u.client.rpc("liquidar_plazo_fijo", {
      p_id: "00000000-0000-0000-0000-000000000000",
    });

    expect(error?.message).toMatch(/PLAZO_NO_ENCONTRADO/);
  });
});
