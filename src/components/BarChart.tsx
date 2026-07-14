"use client";

import {
  BarChart as RechartsBarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import type { Divisa } from "@/types/trading";
import {
  getCategoricalColor,
  formatMontoChart,
  type PieChartDatum,
} from "@/components/chartUtils";

/**
 * Distribución de una cartera como barras verticales. Reemplaza a la torta:
 * las etiquetas de % van arriba de cada barra (fuera del área de clip), así que
 * no se cortan ni se pierden al achicar la pantalla o hacer zoom.
 */
export default function BarChart({
  data,
  divisa,
}: {
  data: PieChartDatum[];
  divisa: Divisa;
}) {
  if (data.length === 0) return null;

  const total = data.reduce((acc, d) => acc + d.value, 0);
  const chartData = data
    .map((d) => ({
      ...d,
      pct: total > 0 ? (d.value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // Con muchas barras, achicarlas todas para que entren rompe la lectura
  // (etiquetas superpuestas, barras casi invisibles). En vez de eso, a partir
  // de este umbral el ancho de cada barra queda fijo y el gráfico scrollea
  // horizontalmente.
  const MAX_BARRAS_SIN_SCROLL = 8;
  const ANCHO_POR_BARRA = 88;
  const necesitaScroll = chartData.length > MAX_BARRAS_SIN_SCROLL;
  const anchoContenido = necesitaScroll
    ? chartData.length * ANCHO_POR_BARRA
    : undefined;

  return (
    <div style={{ width: "100%", overflowX: necesitaScroll ? "auto" : "visible" }}>
      <div style={{ width: anchoContenido ?? "100%", height: 260 }}>
        <ResponsiveContainer>
          <RechartsBarChart
            data={chartData}
            margin={{ top: 24, right: 8, left: 8, bottom: 4 }}
          >
            <XAxis
              dataKey="label"
              interval={0}
              tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: "var(--surface-muted)" }}
              formatter={(value) => [
                `${formatMontoChart(Number(value), divisa)} (${((Number(value) / total) * 100).toFixed(1)}%)`,
                "Valor",
              ]}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
              itemStyle={{ color: "var(--foreground)" }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={72}>
              {chartData.map((_, index) => (
                <Cell key={index} fill={getCategoricalColor(index)} />
              ))}
              <LabelList
                dataKey="pct"
                position="top"
                formatter={(value) => `${Number(value).toFixed(1)}%`}
                style={{ fontSize: 11, fill: "var(--foreground)", fontWeight: 600 }}
              />
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
