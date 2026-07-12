"use client";

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
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

export function getCategoricalColor(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length];
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

function formatMonto(valor: number, divisa: Divisa) {
  if (divisa === "ARS") return formatoARS.format(valor);
  if (divisa === "USDT") return `${valor.toFixed(2)} USDT`;
  return formatoUSD.format(valor);
}

export interface PieChartDatum {
  label: string;
  value: number;
}

export default function PieChart({
  data,
  divisa,
}: {
  data: PieChartDatum[];
  divisa: Divisa;
}) {
  if (data.length === 0) return null;

  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <RechartsPieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="35%"
            cy="50%"
            outerRadius={90}
            label={(props: { percent?: number }) =>
              `${((props.percent ?? 0) * 100).toFixed(0)}%`
            }
          >
            {data.map((_, index) => (
              <Cell key={index} fill={getCategoricalColor(index)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [
              `${formatMonto(Number(value), divisa)} (${((Number(value) / total) * 100).toFixed(1)}%)`,
              name,
            ]}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--foreground)",
              fontSize: 12,
            }}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            formatter={(value: string) => {
              const datum = data.find((d) => d.label === value);
              const pct = datum ? (datum.value / total) * 100 : 0;
              return `${value} — ${pct.toFixed(1)}%`;
            }}
            wrapperStyle={{ fontSize: 12, color: "var(--foreground-muted)" }}
          />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}
