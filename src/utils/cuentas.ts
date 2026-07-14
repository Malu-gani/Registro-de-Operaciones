import type { CuentaId, PlazoFijo, Trade } from "@/types/trading";

/**
 * Cuenta (bolsillo) a la que pertenece una operación según su tipo de activo:
 * - Acciones USD -> `usd`, CEDEARs -> `ars`
 * - Cripto Spot -> `usdt_spot`, Cripto Futuros -> `usdt_futuros`
 */
export function cuentaDeTrade(t: Trade): CuentaId {
  if (t.tipoActivo === "acciones") {
    return t.subTipoActivo === "cedear" ? "ars" : "usd";
  }
  return t.subTipoActivo === "futuros" ? "usdt_futuros" : "usdt_spot";
}

/** Cuenta de un plazo fijo según su divisa. */
export function cuentaDePlazoFijo(pf: PlazoFijo): CuentaId {
  return pf.divisa === "ARS" ? "ars" : "usd";
}

/**
 * Capital comprometido por una operación (lo que se descuenta del Disponible al
 * abrirla). En storage `cantidad` es el tamaño de posición; el capital propio
 * invertido es `cantidad × precioEntrada / apalancamiento`:
 * - Acciones/CEDEARs (sin apalancamiento) -> cantidad × precioEntrada
 * - Cripto Spot (apalancamiento 1)         -> monto invertido
 * - Cripto Futuros                         -> margen (nocional / apalancamiento)
 */
export function costoOperacion(t: Trade): number {
  const apalancamiento = t.apalancamiento && t.apalancamiento > 0 ? t.apalancamiento : 1;
  return (t.cantidad * t.precioEntrada) / apalancamiento;
}

/**
 * Suma el capital comprometido por cuenta a partir de las posiciones abiertas
 * y los plazos fijos pendientes. No convierte divisas: cada cuenta es su propia
 * moneda.
 */
export function comprometidoPorCuenta(
  trades: Trade[],
  plazosPendientes: PlazoFijo[]
): Record<CuentaId, number> {
  const totales: Record<CuentaId, number> = {
    ars: 0,
    usd: 0,
    usdt_spot: 0,
    usdt_futuros: 0,
  };

  for (const t of trades) {
    if (t.estado !== "abierta") continue;
    totales[cuentaDeTrade(t)] += costoOperacion(t);
  }

  for (const pf of plazosPendientes) {
    totales[cuentaDePlazoFijo(pf)] += pf.monto;
  }

  return totales;
}
