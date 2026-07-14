import { comprometidoPorCuenta } from "@/utils/cuentas";
import type { Trade } from "@/types/trading";

const formatoUSD = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const formatoARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

export function formatMonto(valor: number, divisa: "USD" | "ARS" | "USDT") {
  if (divisa === "ARS") return formatoARS.format(valor);
  if (divisa === "USDT") return `${valor >= 0 ? "+" : ""}${valor.toFixed(2)} USDT`;
  return formatoUSD.format(valor);
}

/** Balance total de la cuenta de Futuros = Disponible + Comprometido (margen de posiciones abiertas). */
export function balanceFuturos(disponible: number, trades: Trade[]) {
  const comprometido = comprometidoPorCuenta(trades, []).usdt_futuros;
  return { disponible, comprometido, balance: disponible + comprometido };
}
