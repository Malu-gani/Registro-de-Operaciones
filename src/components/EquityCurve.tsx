"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface PuntoEquity {
  fecha: string;
  valor: number;
}

export default function EquityCurve({ puntos }: { puntos: PuntoEquity[] }) {
  if (puntos.length < 2) {
    return (
      <p className="text-sm text-foreground-muted">
        Necesitás al menos dos operaciones cerradas para ver la curva.
      </p>
    );
  }

  const ultimo = puntos[puntos.length - 1].valor;
  const color = ultimo >= 0 ? "var(--risk-green)" : "var(--risk-red)";

  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <AreaChart data={puntos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="fecha"
            stroke="var(--foreground-muted)"
            fontSize={12}
            tickLine={false}
          />
          <YAxis stroke="var(--foreground-muted)" fontSize={12} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--foreground)",
              fontSize: 12,
            }}
            formatter={(value) => [Number(value).toFixed(2), "P&L acumulado"]}
            labelFormatter={(label) => `Fecha: ${label}`}
          />
          <Area
            type="monotone"
            dataKey="valor"
            stroke={color}
            strokeWidth={2}
            fill="url(#equityFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
