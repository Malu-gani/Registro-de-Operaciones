"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCuentas } from "@/context/CuentasContext";
import BarChart from "@/components/BarChart";
import EquityCurve from "@/components/EquityCurve";
import type { PieChartDatum } from "@/components/chartUtils";
import { formatMonto, balanceFuturos } from "@/components/portafolio/utils";
import type { Trade } from "@/types/trading";

type PresetCurva = "1m" | "3m" | "6m" | "1a" | "custom";

const presetsCurva: { id: PresetCurva; label: string }[] = [
  { id: "1m", label: "Último mes" },
  { id: "3m", label: "3 meses" },
  { id: "6m", label: "6 meses" },
  { id: "1a", label: "1 año" },
  { id: "custom", label: "Personalizado" },
];

function fechaDesdePreset(preset: PresetCurva): string | null {
  if (preset === "custom") return null;
  const meses = { "1m": 1, "3m": 3, "6m": 6, "1a": 12 }[preset];
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
}

function agruparPorActivo(trades: Trade[]): PieChartDatum[] {
  const totales = new Map<string, number>();
  for (const t of trades) {
    const valor = t.cantidad * t.precioEntrada;
    totales.set(t.activo, (totales.get(t.activo) ?? 0) + valor);
  }
  return [...totales.entries()].map(([label, value]) => ({ label, value }));
}

function SeccionDistribucion({
  titulo,
  data,
  divisa,
  mensajeVacio,
}: {
  titulo: string;
  data: PieChartDatum[];
  divisa: "USD" | "ARS" | "USDT";
  mensajeVacio: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-6">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{titulo}</h3>
      {data.length === 0 ? (
        <p className="text-sm text-foreground-muted">{mensajeVacio}</p>
      ) : (
        <div className="flex flex-1 items-center">
          <BarChart data={data} divisa={divisa} />
        </div>
      )}
    </div>
  );
}

function CuentaFuturosCard({
  portafolioId,
  trades,
  mostrarLinkCuenta,
}: {
  portafolioId: string;
  trades: Trade[];
  mostrarLinkCuenta: boolean;
}) {
  const { disponibleDe } = useCuentas();
  const { disponible, comprometido, balance } = balanceFuturos(
    disponibleDe(portafolioId, "usdt_futuros"),
    trades
  );

  const [preset, setPreset] = useState<PresetCurva>("1m");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const cerradasFuturos = useMemo(
    () =>
      trades.filter(
        (t) =>
          t.estado === "cerrada" &&
          t.tipoActivo === "crypto" &&
          t.subTipoActivo === "futuros" &&
          t.resultadoPnl !== undefined
      ),
    [trades]
  );

  const curva = useMemo(() => {
    const desdeEfectivo = preset === "custom" ? desde || null : fechaDesdePreset(preset);
    const hastaEfectivo = preset === "custom" ? hasta || null : null;

    const filtradas = cerradasFuturos.filter((t) => {
      const fecha = t.fechaSalida ?? "";
      if (desdeEfectivo && fecha < desdeEfectivo) return false;
      if (hastaEfectivo && fecha > hastaEfectivo) return false;
      return true;
    });

    return filtradas
      .slice()
      .sort((a, b) => (a.fechaSalida ?? "").localeCompare(b.fechaSalida ?? ""))
      .reduce<{ fecha: string; valor: number }[]>((acc, t) => {
        const anterior = acc.length > 0 ? acc[acc.length - 1].valor : 0;
        acc.push({ fecha: t.fechaSalida ?? "", valor: anterior + (t.resultadoPnl ?? 0) });
        return acc;
      }, []);
  }, [cerradasFuturos, preset, desde, hasta]);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs text-foreground-muted">Cuenta de Futuros</p>
        {mostrarLinkCuenta && (
          <Link
            href="/cuenta?cuenta=usdt_futuros"
            className="text-xs font-medium text-brand hover:underline"
          >
            Ver detalle, depositar o retirar →
          </Link>
        )}
      </div>
      <p className="mt-3 text-xs text-foreground-muted">Saldo total</p>
      <p
        className={`mt-1 text-3xl font-semibold ${
          balance >= 0 ? "text-risk-green" : "text-risk-red"
        }`}
      >
        {formatMonto(balance, "USDT")}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <p className="text-xs text-foreground-muted">Disponible</p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {formatMonto(disponible, "USDT")}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <p className="text-xs text-foreground-muted">Comprometido</p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {formatMonto(comprometido, "USDT")}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-foreground-muted">
            P&L acumulado (USDT)
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {presetsCurva.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`rounded-md border px-2 py-1 text-xs font-medium ${
                  preset === p.id
                    ? "border-brand bg-brand/10 text-foreground"
                    : "border-border text-foreground-muted hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-foreground-muted">
              Desde
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-foreground-muted">
              Hasta
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>
        )}

        {curva.length < 2 ? (
          <p className="text-sm text-foreground-muted">
            Se necesitan al menos dos operaciones de futuros cerradas en el
            período para ver la curva.
          </p>
        ) : (
          <EquityCurve
            puntos={curva}
            formatValor={(valor) => formatMonto(valor, "USDT")}
          />
        )}
      </div>
    </div>
  );
}

/** Secciones de composición de un portafolio (distribución + Cuenta de Futuros). */
export default function SeccionesPortafolio({
  portafolioId,
  trades,
  mostrarLinkCuenta,
}: {
  portafolioId: string;
  trades: Trade[];
  mostrarLinkCuenta: boolean;
}) {
  const abiertas = trades.filter((t) => t.estado === "abierta");
  const cedears = agruparPorActivo(
    abiertas.filter(
      (t) => t.tipoActivo === "acciones" && t.subTipoActivo === "cedear"
    )
  );
  const accionesUsd = agruparPorActivo(
    abiertas.filter((t) => t.tipoActivo === "acciones" && t.subTipoActivo === "usd")
  );
  const cryptoSpot = agruparPorActivo(
    abiertas.filter((t) => t.tipoActivo === "crypto" && t.subTipoActivo === "spot")
  );

  return (
    <>
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">
          Acciones y CEDEARs
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SeccionDistribucion
            titulo="CEDEARs (ARS)"
            data={cedears}
            divisa="ARS"
            mensajeVacio="No tiene CEDEARs abiertos actualmente."
          />
          <SeccionDistribucion
            titulo="Acciones (USD)"
            data={accionesUsd}
            divisa="USD"
            mensajeVacio="No tiene acciones en USD abiertas actualmente."
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">Cripto</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SeccionDistribucion
            titulo="Spot (USDT)"
            data={cryptoSpot}
            divisa="USDT"
            mensajeVacio="No tiene posiciones spot abiertas actualmente."
          />

          <CuentaFuturosCard
            portafolioId={portafolioId}
            trades={trades}
            mostrarLinkCuenta={mostrarLinkCuenta}
          />
        </div>
      </section>
    </>
  );
}
