import { describe, expect, test } from "vitest";
import { superponerSobreFila } from "../setup/filaRetenida";
import { crearUsuarioDePrueba, disponibleDe, type UsuarioDePrueba } from "../setup/usuarios";

/**
 * Llamadas superpuestas sobre el mismo registro (migración 023): las RPC que lo
 * cambian de estado tienen que atenderse de a una, y la que llega segunda debe
 * ver lo que dejó la primera.
 */

async function conSaldo(cuenta: "usd" | "ars") {
  const u = await crearUsuarioDePrueba();
  const { error } = await u.client.rpc("set_saldo_inicial", {
    p_portafolio_id: u.portafolioId,
    p_cuenta: cuenta,
    p_monto: 10000,
  });
  if (error) throw new Error(error.message);
  return u;
}

/** 10 unidades a 100: deja 9000 disponibles. */
async function conOperacionAbierta() {
  const u = await conSaldo("usd");
  const { data: opId, error } = await u.client.rpc("abrir_operacion", {
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
    p_porcentaje_riesgo: 1,
    p_notas: null,
  });
  if (error) throw new Error(error.message);
  return { u, opId: opId as string };
}

function cierre(u: UsuarioDePrueba, opId: string, cantidad: number) {
  return () =>
    u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: cantidad,
    });
}

async function movimientos(u: UsuarioDePrueba, tipo: string) {
  const { data, error } = await u.client
    .from("movimientos_cuenta")
    .select("monto")
    .eq("tipo", tipo);
  if (error) throw new Error(error.message);
  return data.map((m) => Number(m.monto));
}

async function operaciones(u: UsuarioDePrueba) {
  const { data, error } = await u.client
    .from("operaciones")
    .select("estado, cantidad")
    .order("estado");
  if (error) throw new Error(error.message);
  return data.map((o) => ({ estado: o.estado as string, cantidad: Number(o.cantidad) }));
}

describe("cerrar_operacion — llamadas superpuestas", () => {
  test("dos cierres totales: se acredita una sola vez", async () => {
    const { u, opId } = await conOperacionAbierta();

    const [primera, segunda] = await superponerSobreFila("operaciones", opId, [
      cierre(u, opId, 10),
      cierre(u, opId, 10),
    ]);

    // 9000 + costo 1000 + resultado 200.
    expect(await disponibleDe(u, "usd")).toBe(10200);
    expect(await movimientos(u, "cierre")).toEqual([1200]);
    expect(primera.error).toBeNull();
    expect(segunda.error?.message).toMatch(/OPERACION_YA_CERRADA/);
  });

  test("un parcial y un total: el total ya no entra en lo que queda", async () => {
    const { u, opId } = await conOperacionAbierta();

    const [parcial, total] = await superponerSobreFila("operaciones", opId, [
      cierre(u, opId, 4),
      cierre(u, opId, 10),
    ]);

    expect(await disponibleDe(u, "usd")).toBe(9480);
    expect(await movimientos(u, "cierre")).toEqual([480]);
    expect(parcial.error).toBeNull();
    expect(total.error?.message).toMatch(/CANTIDAD_INVALIDA/);
  });

  test("dos parciales que juntos exceden la posición: entra solo el primero", async () => {
    const { u, opId } = await conOperacionAbierta();

    const [primera, segunda] = await superponerSobreFila("operaciones", opId, [
      cierre(u, opId, 6),
      cierre(u, opId, 6),
    ]);

    expect(primera.error).toBeNull();
    expect(segunda.error?.message).toMatch(/CANTIDAD_INVALIDA/);
    expect(await disponibleDe(u, "usd")).toBe(9720);
    expect(await operaciones(u)).toEqual([
      { estado: "abierta", cantidad: 4 },
      { estado: "cerrada", cantidad: 6 },
    ]);
  });

  test("dos parciales que entran en la posición: se aplican los dos", async () => {
    const { u, opId } = await conOperacionAbierta();

    const resultados = await superponerSobreFila("operaciones", opId, [
      cierre(u, opId, 4),
      cierre(u, opId, 4),
    ]);

    expect(resultados.map((r) => r.error)).toEqual([null, null]);
    expect(await disponibleDe(u, "usd")).toBe(9960);
    expect(await operaciones(u)).toEqual([
      { estado: "abierta", cantidad: 2 },
      { estado: "cerrada", cantidad: 4 },
      { estado: "cerrada", cantidad: 4 },
    ]);
  });
});

describe("liquidar_plazo_fijo — llamadas superpuestas", () => {
  test("dos liquidaciones: se acredita una sola vez", async () => {
    const u = await conSaldo("ars");
    const { data: id, error } = await u.client.rpc("abrir_plazo_fijo", {
      p_portafolio_id: u.portafolioId,
      p_monto: 1000,
      p_divisa: "ARS",
      p_tasa_tna: 12,
      p_plazo_dias: 30,
      p_fecha_inicio: "2026-07-01",
      p_fecha_vencimiento: "2026-07-31",
      p_interes_estimado: 10,
      p_notas: null,
    });
    expect(error).toBeNull();
    const liquidar = () => u.client.rpc("liquidar_plazo_fijo", { p_id: id as string });

    const [primera, segunda] = await superponerSobreFila("plazos_fijos", id as string, [
      liquidar,
      liquidar,
    ]);

    expect(await disponibleDe(u, "ars")).toBe(10010);
    expect(await movimientos(u, "plazo_liquidacion")).toEqual([1010]);
    expect(primera.error).toBeNull();
    expect(segunda.error?.message).toMatch(/PLAZO_YA_LIQUIDADO/);
  });
});
