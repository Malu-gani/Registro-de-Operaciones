import type { Divisa } from "@/types/trading";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

/** Color categórico cíclico de la paleta --chart-1..--chart-8 (light/dark en globals.css). */
export function getCategoricalColor(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export interface PieChartDatum {
  label: string;
  value: number;
}

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

export function formatMontoChart(valor: number, divisa: Divisa) {
  if (divisa === "ARS") return formatoARS.format(valor);
  if (divisa === "USDT") return `${valor.toFixed(2)} USDT`;
  return formatoUSD.format(valor);
}
