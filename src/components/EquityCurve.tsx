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

export default function EquityCurve({
  puntos,
  formatValor,
}: {
  puntos: PuntoEquity[];
  /** Formatea el valor del tooltip (por defecto, dos decimales sin símbolo). */
  formatValor?: (valor: number) => string;
}) {
  if (puntos.length < 2) {
    return (
      <p className="text-sm text-foreground-muted">
        Se necesitan al menos dos operaciones cerradas para ver la curva.
      </p>
    );
  }

  const formatTooltip = formatValor ?? ((valor: number) => valor.toFixed(2));

  const ultimo = puntos[puntos.length - 1].valor;
  // El P&L positivo usa el violeta de marca (look de la referencia); el
  // negativo mantiene el rojo semántico.
  const color = ultimo >= 0 ? "var(--brand)" : "var(--risk-red)";

  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <AreaChart data={puntos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            {/* Glow suave sobre la línea, como el trazo luminoso de la referencia. */}
            <filter id="equityGlow" x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
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
            cursor={{ stroke: "var(--brand)", strokeWidth: 1, strokeDasharray: "4 4" }}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid color-mix(in srgb, var(--brand) 45%, var(--border))",
              borderRadius: 10,
              fontSize: 12,
              boxShadow: "0 8px 24px -12px var(--glow)",
            }}
            labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
            itemStyle={{ color: "var(--foreground)" }}
            formatter={(value) => [formatTooltip(Number(value)), "P&L acumulado"]}
            labelFormatter={(label) => `Fecha: ${label}`}
          />
          <Area
            type="monotone"
            dataKey="valor"
            stroke={color}
            strokeWidth={2.5}
            fill="url(#equityFill)"
            filter="url(#equityGlow)"
            activeDot={{
              r: 5,
              fill: color,
              stroke: "var(--surface)",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
