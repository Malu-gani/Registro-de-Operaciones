"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTrades } from "@/context/TradesContext";
import { usePlazosFijos } from "@/context/PlazosFijosContext";
import { calcularPnl, plazoFijoVencido } from "@/utils/riskCalculations";
import type { Divisa, Trade, TipoActivo, SubTipoAccion, SubTipoCrypto } from "@/types/trading";

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
  if (divisa === "USDT") return `${valor >= 0 ? "+" : ""}${valor.toFixed(2)} USDT`;
  return formatoUSD.format(valor);
}

const formatoCantidad = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 6,
});

function formatCantidad(valor: number) {
  return formatoCantidad.format(valor);
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function CerrarOperacionModal({
  trade,
  onClose,
}: {
  trade: Trade;
  onClose: () => void;
}) {
  const { closeTrade } = useTrades();
  const [precioSalida, setPrecioSalida] = useState("");
  const [fechaSalida, setFechaSalida] = useState(hoyISO());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const precioSalidaNum = parseFloat(precioSalida);
  const pnl =
    !isNaN(precioSalidaNum) && precioSalidaNum > 0
      ? calcularPnl(trade.tipoOperacion, trade.precioEntrada, precioSalidaNum, trade.cantidad)
      : null;

  async function handleConfirmar() {
    if (isNaN(precioSalidaNum) || precioSalidaNum <= 0 || !fechaSalida || pnl === null) {
      setError("Completá precio y fecha de salida.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await closeTrade(trade.id, {
        fechaSalida,
        precioSalida: precioSalidaNum,
        resultadoPnl: pnl,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cerrar la operación");
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          Cerrar operación · {trade.activo}
        </h2>
        <p className="mb-4 text-xs text-foreground-muted">
          {trade.tipoOperacion === "long" ? "Long" : "Short"} · Entrada{" "}
          {trade.precioEntrada} · Cantidad {formatCantidad(trade.cantidad)}
        </p>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-foreground-muted">
            Precio de salida
          </label>
          <input
            type="number"
            step="any"
            value={precioSalida}
            onChange={(e) => setPrecioSalida(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
            autoFocus
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-foreground-muted">
            Fecha de salida
          </label>
          <input
            type="date"
            value={fechaSalida}
            onChange={(e) => setFechaSalida(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
          />
        </div>

        <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-surface-muted px-3 py-2">
          <span className="text-xs text-foreground-muted">P&L resultante</span>
          <span
            className={`text-sm font-semibold ${
              pnl === null
                ? "text-foreground-muted"
                : pnl >= 0
                  ? "text-risk-green"
                  : "text-risk-red"
            }`}
          >
            {pnl === null ? "—" : formatMonto(pnl, trade.divisa)}
          </span>
        </div>

        {error && (
          <p className="mb-3 rounded-md border border-risk-red-border bg-risk-red-bg px-3 py-2 text-xs text-risk-red">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={guardando || pnl === null}
            className="flex-1 rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Confirmar cierre"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TablaOperacionesAbiertas({
  tipoActivo,
  subTipoActivo,
  mensajeVacio,
}: {
  tipoActivo: TipoActivo;
  subTipoActivo?: SubTipoAccion | SubTipoCrypto;
  mensajeVacio: string;
}) {
  const { trades, loading, error } = useTrades();
  const [tradeACerrar, setTradeACerrar] = useState<Trade | null>(null);

  const abiertas = trades
    .filter(
      (t) =>
        t.estado === "abierta" &&
        t.tipoActivo === tipoActivo &&
        (subTipoActivo === undefined || t.subTipoActivo === subTipoActivo)
    )
    .sort((a, b) => b.fechaEntrada.localeCompare(a.fechaEntrada));

  if (error) {
    return (
      <div className="rounded-lg border border-risk-red-border bg-risk-red-bg p-4 text-sm text-risk-red">
        {error}
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-foreground-muted">Cargando operaciones...</p>;
  }

  if (abiertas.length === 0) {
    return <p className="text-sm text-foreground-muted">{mensajeVacio}</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground-muted">
              <th className="px-4 py-3 font-medium">Activo</th>
              <th className="px-4 py-3 font-medium">Divisa</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Fecha entrada</th>
              <th className="px-4 py-3 font-medium">Entrada</th>
              <th className="px-4 py-3 font-medium">Stop Loss</th>
              <th className="px-4 py-3 font-medium">Take Profit</th>
              <th className="px-4 py-3 font-medium">Cantidad</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {abiertas.map((trade) => (
              <tr key={trade.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">
                  {trade.activo}
                </td>
                <td className="px-4 py-3 text-foreground-muted">{trade.divisa}</td>
                <td className="px-4 py-3 capitalize text-foreground-muted">
                  {trade.tipoOperacion}
                </td>
                <td className="px-4 py-3 text-foreground-muted">
                  {trade.fechaEntrada}
                </td>
                <td className="px-4 py-3 text-foreground-muted">
                  {trade.precioEntrada}
                </td>
                <td className="px-4 py-3 text-foreground-muted">
                  {trade.precioStopLoss ?? "—"}
                </td>
                <td className="px-4 py-3 text-foreground-muted">
                  {trade.precioTakeProfit ?? "—"}
                </td>
                <td className="px-4 py-3 text-foreground-muted">
                  {formatCantidad(trade.cantidad)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setTradeACerrar(trade)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted"
                  >
                    Cerrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tradeACerrar && (
        <CerrarOperacionModal
          trade={tradeACerrar}
          onClose={() => setTradeACerrar(null)}
        />
      )}
    </>
  );
}

function diasRestantes(fechaVencimiento: string): number {
  const hoy = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
  const vencimiento = new Date(`${fechaVencimiento}T00:00:00`);
  return Math.round((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function TablaPlazosFijosPendientes() {
  const { plazosFijos, loading, error } = usePlazosFijos();

  const pendientes = plazosFijos
    .filter((pf) => !plazoFijoVencido(pf.fechaVencimiento))
    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));

  if (error) {
    return (
      <div className="rounded-lg border border-risk-red-border bg-risk-red-bg p-4 text-sm text-risk-red">
        {error}
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-foreground-muted">Cargando plazos fijos...</p>;
  }

  if (pendientes.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        No tenés plazos fijos pendientes de vencimiento en este momento.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[750px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-foreground-muted">
            <th className="px-4 py-3 font-medium">Monto</th>
            <th className="px-4 py-3 font-medium">TNA</th>
            <th className="px-4 py-3 font-medium">Plazo</th>
            <th className="px-4 py-3 font-medium">Fecha inicio</th>
            <th className="px-4 py-3 font-medium">Vencimiento</th>
            <th className="px-4 py-3 font-medium">Días restantes</th>
            <th className="px-4 py-3 font-medium">Interés proyectado</th>
          </tr>
        </thead>
        <tbody>
          {pendientes.map((pf) => (
            <tr key={pf.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium text-foreground">
                {formatMonto(pf.monto, pf.divisa)}
              </td>
              <td className="px-4 py-3 text-foreground-muted">{pf.tasaTna}%</td>
              <td className="px-4 py-3 text-foreground-muted">{pf.plazoDias} días</td>
              <td className="px-4 py-3 text-foreground-muted">{pf.fechaInicio}</td>
              <td className="px-4 py-3 text-foreground-muted">
                {pf.fechaVencimiento}
              </td>
              <td className="px-4 py-3 text-foreground-muted">
                {diasRestantes(pf.fechaVencimiento)}
              </td>
              <td className="px-4 py-3 font-medium text-risk-green">
                +{formatMonto(pf.interesEstimado, pf.divisa)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const tabs = [
  { id: "acciones", label: "Acciones" },
  { id: "cedears", label: "CEDEARs" },
  { id: "crypto-futuros", label: "Crypto Futuros" },
  { id: "crypto-spot", label: "Crypto Spot" },
  { id: "plazos-fijos", label: "Plazos Fijos" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const tabIds = tabs.map((t) => t.id) as readonly string[];

export default function PosicionesAbiertasPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tabInicial: TabId = tabIds.includes(tabParam ?? "")
    ? (tabParam as TabId)
    : "acciones";
  const [tab, setTab] = useState<TabId>(tabInicial);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-4 text-lg font-semibold text-foreground">
        Posiciones Abiertas
      </h1>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-brand text-foreground"
                : "border-transparent text-foreground-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "acciones" && (
        <TablaOperacionesAbiertas
          tipoActivo="acciones"
          subTipoActivo="usd"
          mensajeVacio="No tenés posiciones abiertas de Acciones en este momento."
        />
      )}
      {tab === "cedears" && (
        <TablaOperacionesAbiertas
          tipoActivo="acciones"
          subTipoActivo="cedear"
          mensajeVacio="No tenés posiciones abiertas de CEDEARs en este momento."
        />
      )}
      {tab === "crypto-futuros" && (
        <TablaOperacionesAbiertas
          tipoActivo="crypto"
          subTipoActivo="futuros"
          mensajeVacio="No tenés posiciones abiertas de Crypto Futuros en este momento."
        />
      )}
      {tab === "crypto-spot" && (
        <TablaOperacionesAbiertas
          tipoActivo="crypto"
          subTipoActivo="spot"
          mensajeVacio="No tenés posiciones abiertas de Crypto Spot en este momento."
        />
      )}
      {tab === "plazos-fijos" && <TablaPlazosFijosPendientes />}
    </div>
  );
}
