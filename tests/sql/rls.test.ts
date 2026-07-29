import { beforeAll, describe, expect, test } from "vitest";
import { crearUsuarioDePrueba, type UsuarioDePrueba } from "../setup/usuarios";

/**
 * A tiene datos cargados; B es un usuario cualquiera. B no debe poder ver ni
 * tocar nada de A por ninguna vía: lectura directa, escritura directa, o RPC.
 */
let A: UsuarioDePrueba;
let B: UsuarioDePrueba;
let opIdDeA: string;

beforeAll(async () => {
  [A, B] = await Promise.all([crearUsuarioDePrueba(), crearUsuarioDePrueba()]);

  await A.client.rpc("set_saldo_inicial", {
    p_portafolio_id: A.portafolioId,
    p_cuenta: "usd",
    p_monto: 5000,
  });
  const { data } = await A.client.rpc("abrir_operacion", {
    p_portafolio_id: A.portafolioId,
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
  });
  opIdDeA = data as string;
});

describe("lectura: B no ve nada de A", () => {
  test("no ve los portafolios de A", async () => {
    const { data } = await B.client.from("portafolios").select("id");
    expect(data?.map((p) => p.id)).not.toContain(A.portafolioId);
  });

  test("no ve las operaciones de A", async () => {
    const { data } = await B.client.from("operaciones").select("id");
    expect(data).toHaveLength(0);
  });

  test("no ve los saldos de A", async () => {
    const { data } = await B.client
      .from("cuentas_saldos")
      .select("id")
      .eq("portafolio_id", A.portafolioId);
    expect(data).toHaveLength(0);
  });

  test("no ve los movimientos de A", async () => {
    const { data } = await B.client
      .from("movimientos_cuenta")
      .select("id")
      .eq("portafolio_id", A.portafolioId);
    expect(data).toHaveLength(0);
  });
});

describe("escritura directa: B no puede tocar datos de A", () => {
  test("no puede insertar una operación en el portafolio de A", async () => {
    const { error } = await B.client.from("operaciones").insert({
      portafolio_id: A.portafolioId,
      activo: "HACK",
      tipo_operacion: "long",
      fecha_entrada: "2026-07-01",
      precio_entrada: 1,
      cantidad: 1,
      ratio_riesgo_beneficio: 1,
      porcentaje_riesgo_cuenta: 1,
    });

    expect(error).not.toBeNull();
  });

  test("no puede renombrar el portafolio de A", async () => {
    await B.client.from("portafolios").update({ nombre: "Robado" }).eq("id", A.portafolioId);

    const { data } = await A.client
      .from("portafolios")
      .select("nombre")
      .eq("id", A.portafolioId)
      .single();
    expect(data?.nombre).toBe("Mi Cuenta Principal");
  });

  test("no puede borrar el portafolio de A", async () => {
    await B.client.from("portafolios").delete().eq("id", A.portafolioId);

    const { data } = await A.client
      .from("portafolios")
      .select("id")
      .eq("id", A.portafolioId);
    expect(data).toHaveLength(1);
  });
});

describe("RPC: B no puede operar sobre el portafolio de A", () => {
  test("set_saldo_inicial sobre el portafolio de A es rechazado", async () => {
    const { error } = await B.client.rpc("set_saldo_inicial", {
      p_portafolio_id: A.portafolioId,
      p_cuenta: "usd",
      p_monto: 999999,
    });

    expect(error?.message).toMatch(/PORTAFOLIO_NO_AUTORIZADO/);
  });

  test("registrar_movimiento_cuenta sobre el portafolio de A es rechazado", async () => {
    const { error } = await B.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: A.portafolioId,
      p_cuenta: "usd",
      p_tipo: "retiro",
      p_monto: 100,
      p_fecha: "2026-07-01",
      p_notas: null,
    });

    expect(error?.message).toMatch(/PORTAFOLIO_NO_AUTORIZADO/);
  });

  test("cerrar_operacion sobre una operación de A es rechazado", async () => {
    const { error } = await B.client.rpc("cerrar_operacion", {
      p_op_id: opIdDeA,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });

    expect(error?.message).toMatch(/PORTAFOLIO_NO_AUTORIZADO/);
  });

  test("abrir_plazo_fijo sobre el portafolio de A es rechazado", async () => {
    const { error } = await B.client.rpc("abrir_plazo_fijo", {
      p_portafolio_id: A.portafolioId,
      p_monto: 100,
      p_divisa: "USD",
      p_tasa_tna: 50,
      p_plazo_dias: 30,
      p_fecha_inicio: "2026-07-01",
      p_fecha_vencimiento: "2026-07-31",
      p_interes_estimado: 4,
      p_notas: null,
    });

    expect(error?.message).toMatch(/PORTAFOLIO_NO_AUTORIZADO/);
  });
});

describe("el ledger de movimientos es append-only", () => {
  test("el propio dueño no puede editar un movimiento", async () => {
    const { data: mov } = await A.client
      .from("movimientos_cuenta")
      .select("id, monto")
      .eq("tipo", "apertura")
      .single();

    await A.client
      .from("movimientos_cuenta")
      .update({ monto: 0 })
      .eq("id", mov?.id);

    const { data: despues } = await A.client
      .from("movimientos_cuenta")
      .select("monto")
      .eq("id", mov?.id)
      .single();

    expect(Number(despues?.monto)).toBe(Number(mov?.monto));
  });

  test("el propio dueño no puede borrar un movimiento", async () => {
    const { data: antes } = await A.client
      .from("movimientos_cuenta")
      .select("id")
      .eq("portafolio_id", A.portafolioId);

    await A.client
      .from("movimientos_cuenta")
      .delete()
      .eq("portafolio_id", A.portafolioId);

    const { data: despues } = await A.client
      .from("movimientos_cuenta")
      .select("id")
      .eq("portafolio_id", A.portafolioId);

    expect(despues).toHaveLength(antes?.length ?? 0);
  });
});

describe("nombres de portafolio únicos por usuario", () => {
  test("el mismo usuario no puede repetir un nombre", async () => {
    const { error } = await A.client.from("portafolios").insert({
      nombre: "Mi Cuenta Principal",
      tipo_mercado: "mixto",
      user_id: A.userId,
    });

    expect(error?.code).toBe("23505");
  });

  test("la unicidad ignora mayúsculas y espacios", async () => {
    const { error } = await A.client.from("portafolios").insert({
      nombre: "  mi cuenta principal  ",
      tipo_mercado: "mixto",
      user_id: A.userId,
    });

    expect(error?.code).toBe("23505");
  });

  test("dos usuarios distintos sí pueden tener el mismo nombre", async () => {
    const { data } = await B.client
      .from("portafolios")
      .select("nombre")
      .eq("id", B.portafolioId)
      .single();

    expect(data?.nombre).toBe("Mi Cuenta Principal");
  });
});
