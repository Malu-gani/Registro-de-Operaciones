"use client";

import Link from "next/link";
import { useCuentas } from "@/context/CuentasContext";
import BarChart from "@/components/BarChart";
import type { PieChartDatum } from "@/components/chartUtils";
import { formatMonto, balanceFuturos } from "@/components/portafolio/utils";
import type { Trade } from "@/types/trading";

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
    <div className="rounded-xl border border-border bg-surface p-6">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{titulo}</h3>
      {data.length === 0 ? (
        <p className="text-sm text-foreground-muted">{mensajeVacio}</p>
      ) : (
        <BarChart data={data} divisa={divisa} />
      )}
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

  const { disponibleDe } = useCuentas();
  const { disponible, comprometido, balance } = balanceFuturos(
    disponibleDe(portafolioId, "usdt_futuros"),
    trades
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

          <div className="rounded-xl border border-border bg-surface p-6">
            <p className="text-xs text-foreground-muted">Cuenta de Futuros</p>
            <p
              className={`mt-1 text-2xl font-semibold ${
                balance >= 0 ? "text-risk-green" : "text-risk-red"
              }`}
            >
              {formatMonto(balance, "USDT")}
            </p>
            <p className="mt-1 text-xs text-foreground-muted">
              Disponible {formatMonto(disponible, "USDT")} + Comprometido{" "}
              {formatMonto(comprometido, "USDT")}
            </p>
            {mostrarLinkCuenta && (
              <Link
                href="/cuenta?cuenta=usdt_futuros"
                className="mt-3 inline-block text-xs font-medium text-brand hover:underline"
              >
                Ver detalle, depositar o retirar →
              </Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
