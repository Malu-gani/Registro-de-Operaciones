import { describe, expect, test } from "vitest";
import { crearUsuarioDePrueba } from "../setup/usuarios";

/**
 * Invariante del sistema de saldos: para cada cuenta, la suma con signo de sus
 * movimientos tiene que dar exactamente su `disponible`. Cualquier camino futuro
 * que mueva saldo sin registrar movimiento (o al revés) rompe este test, aunque
 * los tests puntuales de cada RPC sigan pasando.
 *
 * Verifica además que ningún disponible quede negativo. Esa segunda invariante
 * se agregó tras medir el defecto 9.5 (tarea 11): cerrar una posición long a
 * precio negativo deja la cuenta en -6000, esquivando la guarda de
 * FONDOS_INSUFICIENTES que el resto del sistema respeta. Acá no se ejercita ese
 * camino, así que este test pasa; queda como red para que el arreglo del 9.5 no
 * reintroduzca el agujero por otro lado.
 */
async function verificarInvariante(u: Awaited<ReturnType<typeof crearUsuarioDePrueba>>) {
  const { data: movs } = await u.client
    .from("movimientos_cuenta")
    .select("cuenta, monto")
    .eq("portafolio_id", u.portafolioId);

  const sumaPorCuenta = new Map<string, number>();
  for (const m of movs ?? []) {
    const cuenta = m.cuenta as string;
    sumaPorCuenta.set(cuenta, (sumaPorCuenta.get(cuenta) ?? 0) + Number(m.monto));
  }

  const { data: saldos } = await u.client
    .from("cuentas_saldos")
    .select("cuenta, disponible")
    .eq("portafolio_id", u.portafolioId);

  for (const s of saldos ?? []) {
    const cuenta = s.cuenta as string;
    expect(
      Number(s.disponible),
      `la cuenta ${cuenta} no cuadra con su ledger`
    ).toBeCloseTo(sumaPorCuenta.get(cuenta) ?? 0, 6);

    expect(
      Number(s.disponible),
      `la cuenta ${cuenta} quedó con disponible negativo`
    ).toBeGreaterThanOrEqual(0);
  }

  return saldos?.length ?? 0;
}

describe("invariante contable", () => {
  test("saldo y ledger cuadran tras una secuencia completa", async () => {
    const u = await crearUsuarioDePrueba();

    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usd",
      p_monto: 10000,
    });
    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_monto: 200000,
    });

    await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usd",
      p_tipo: "deposito",
      p_monto: 2000,
      p_fecha: "2026-07-02",
      p_notas: "Aporte",
    });

    const { data: opId } = await u.client.rpc("abrir_operacion", {
      p_portafolio_id: u.portafolioId,
      p_activo: "AAPL",
      p_tipo_activo: "acciones",
      p_sub_tipo_activo: "usd",
      p_divisa: "USD",
      p_apalancamiento: null,
      p_tipo_operacion: "long",
      p_fecha_entrada: "2026-07-03",
      p_precio_entrada: 100,
      p_precio_stop_loss: 90,
      p_precio_take_profit: 130,
      p_cantidad: 20,
      p_ratio_riesgo_beneficio: 3,
      p_porcentaje_riesgo: 10,
      p_notas: null,
    });

    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 115,
      p_fecha_salida: "2026-07-05",
      p_cantidad_cerrada: 8,
    });
    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 95,
      p_fecha_salida: "2026-07-06",
      p_cantidad_cerrada: 12,
    });

    const { data: plazoId } = await u.client.rpc("abrir_plazo_fijo", {
      p_portafolio_id: u.portafolioId,
      p_monto: 100000,
      p_divisa: "ARS",
      p_tasa_tna: 73,
      p_plazo_dias: 30,
      p_fecha_inicio: "2026-07-01",
      p_fecha_vencimiento: "2026-07-31",
      p_interes_estimado: 6000,
      p_notas: null,
    });
    await u.client.rpc("liquidar_plazo_fijo", { p_id: plazoId });

    await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_tipo: "retiro",
      p_monto: 50000,
      p_fecha: "2026-07-07",
      p_notas: null,
    });

    const cuentasVerificadas = await verificarInvariante(u);
    expect(cuentasVerificadas).toBe(2);
  });

  test("una operación fallida por fondos no desbalancea nada", async () => {
    const u = await crearUsuarioDePrueba();

    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usd",
      p_monto: 100,
    });

    await u.client.rpc("abrir_operacion", {
      p_portafolio_id: u.portafolioId,
      p_activo: "AAPL",
      p_tipo_activo: "acciones",
      p_sub_tipo_activo: "usd",
      p_divisa: "USD",
      p_apalancamiento: null,
      p_tipo_operacion: "long",
      p_fecha_entrada: "2026-07-03",
      p_precio_entrada: 100,
      p_precio_stop_loss: 90,
      p_precio_take_profit: 130,
      p_cantidad: 50,
      p_ratio_riesgo_beneficio: 3,
      p_porcentaje_riesgo: 10,
      p_notas: null,
    });

    await verificarInvariante(u);
  });
});
