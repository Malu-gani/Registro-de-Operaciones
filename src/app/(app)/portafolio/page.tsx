"use client";

import { useEffect, useState } from "react";
import { useTrades } from "@/context/TradesContext";
import { useMovimientosFuturos } from "@/context/MovimientosFuturosContext";
import { TODOS_LOS_PORTAFOLIOS, usePortafolios } from "@/context/PortafoliosContext";
import { usePortafolioDestino } from "@/components/forms/usePortafolioDestino";
import { fetchTrades } from "@/lib/tradesApi";
import { fetchPlazosFijos } from "@/lib/plazosFijosApi";
import { fetchMovimientosFuturos } from "@/lib/movimientosFuturosApi";
import PieChart, { type PieChartDatum } from "@/components/PieChart";
import { inputClasses, labelClasses } from "@/components/formStyles";
import type { MovimientoFuturos, Portafolio, Trade } from "@/types/trading";

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

function formatMonto(valor: number, divisa: "USD" | "ARS" | "USDT") {
  if (divisa === "ARS") return formatoARS.format(valor);
  if (divisa === "USDT") return `${valor >= 0 ? "+" : ""}${valor.toFixed(2)} USDT`;
  return formatoUSD.format(valor);
}

function agruparPorActivo(trades: Trade[]): PieChartDatum[] {
  const totales = new Map<string, number>();
  for (const t of trades) {
    const valor = t.cantidad * t.precioEntrada;
    totales.set(t.activo, (totales.get(t.activo) ?? 0) + valor);
  }
  return [...totales.entries()].map(([label, value]) => ({ label, value }));
}

function calcularBalanceFuturos(trades: Trade[], movimientos: MovimientoFuturos[]) {
  const pnlFuturosCerradas = trades
    .filter(
      (t) =>
        t.tipoActivo === "crypto" &&
        t.subTipoActivo === "futuros" &&
        t.estado === "cerrada"
    )
    .reduce((acc, t) => acc + (t.resultadoPnl ?? 0), 0);

  const totalMovimientos = movimientos.reduce((acc, m) => acc + m.monto, 0);

  return { totalMovimientos, pnlFuturosCerradas, balance: totalMovimientos + pnlFuturosCerradas };
}

function SeccionPie({
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
        <PieChart data={data} divisa={divisa} />
      )}
    </div>
  );
}

function NuevoMovimientoForm() {
  const { addMovimiento } = useMovimientosFuturos();
  const { portafolioId, selectorField } = usePortafolioDestino();
  const [tipo, setTipo] = useState<"deposito" | "retiro">("deposito");
  const [monto, setMonto] = useState(0);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!monto || !fecha || !portafolioId) return;
    setGuardando(true);
    try {
      await addMovimiento(
        {
          monto: tipo === "retiro" ? -Math.abs(monto) : Math.abs(monto),
          fecha,
          notas: notas || undefined,
        },
        portafolioId
      );
      setMonto(0);
      setNotas("");
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el movimiento."
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2"
    >
      {selectorField}

      <label className="flex flex-col gap-1">
        <span className={labelClasses}>Movimiento</span>
        <div className="flex gap-2 pt-1.5">
          {(["deposito", "retiro"] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setTipo(t)}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                tipo === t
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-surface-muted text-foreground-muted"
              }`}
            >
              {t === "deposito" ? "Depósito" : "Retiro"}
            </button>
          ))}
        </div>
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClasses}>Monto (USDT)</span>
        <input
          type="number"
          className={inputClasses}
          value={monto || ""}
          onChange={(e) => setMonto(Number(e.target.value))}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClasses}>Fecha</span>
        <input
          type="date"
          className={inputClasses}
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClasses}>Notas (opcional)</span>
        <input
          className={inputClasses}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
      </label>

      <button
        type="submit"
        disabled={guardando || !portafolioId}
        className="col-span-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
      >
        {guardando ? "Guardando..." : "Registrar movimiento"}
      </button>

      {error && <p className="col-span-2 text-xs text-risk-red">{error}</p>}
    </form>
  );
}

function TablaMovimientos({ movimientos }: { movimientos: MovimientoFuturos[] }) {
  if (movimientos.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        Todavía no cargó movimientos de la cuenta de futuros.
      </p>
    );
  }

  const ordenados = [...movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[500px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-foreground-muted">
            <th className="px-4 py-3 font-medium">Fecha</th>
            <th className="px-4 py-3 font-medium">Monto</th>
            <th className="px-4 py-3 font-medium">Notas</th>
          </tr>
        </thead>
        <tbody>
          {ordenados.map((m) => (
            <tr key={m.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 text-foreground-muted">{m.fecha}</td>
              <td
                className={`px-4 py-3 font-medium ${
                  m.monto >= 0 ? "text-risk-green" : "text-risk-red"
                }`}
              >
                {formatMonto(m.monto, "USDT")}
              </td>
              <td className="px-4 py-3 text-foreground-muted">{m.notas ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Secciones de composición de un portafolio (tortas + Cuenta de Futuros). */
function SeccionesPortafolio({
  trades,
  movimientos,
  mostrarFormularioMovimiento,
}: {
  trades: Trade[];
  movimientos: MovimientoFuturos[];
  mostrarFormularioMovimiento: boolean;
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

  const { totalMovimientos, pnlFuturosCerradas, balance } = calcularBalanceFuturos(
    trades,
    movimientos
  );

  return (
    <>
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground">
          Acciones y CEDEARs
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SeccionPie
            titulo="CEDEARs (ARS)"
            data={cedears}
            divisa="ARS"
            mensajeVacio="No tiene CEDEARs abiertos actualmente."
          />
          <SeccionPie
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
          <SeccionPie
            titulo="Spot (USDT)"
            data={cryptoSpot}
            divisa="USDT"
            mensajeVacio="No tiene posiciones spot abiertas actualmente."
          />

          <div className="flex flex-col gap-4">
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
                Movimientos manuales {formatMonto(totalMovimientos, "USDT")} + P&L
                de operaciones cerradas {formatMonto(pnlFuturosCerradas, "USDT")}
              </p>
            </div>
            {mostrarFormularioMovimiento && <NuevoMovimientoForm />}
          </div>
        </div>

        <TablaMovimientos movimientos={movimientos} />
      </section>
    </>
  );
}

/** Datos que necesita el modal de borrado, siempre traídos frescos del portafolio en cuestión (no depende de cuál esté activo en el Navbar). */
function useDatosPortafolio(portafolioId: string) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [plazosFijos, setPlazosFijos] = useState<{ monto: number; divisa: "USD" | "ARS" }[] | null>(
    null
  );
  const [movimientos, setMovimientos] = useState<MovimientoFuturos[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchTrades(portafolioId),
      fetchPlazosFijos(portafolioId),
      fetchMovimientosFuturos(portafolioId),
    ])
      .then(([t, p, m]) => {
        setTrades(t);
        setPlazosFijos(p);
        setMovimientos(m);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudieron cargar los datos del portafolio.")
      );
  }, [portafolioId]);

  return { trades, plazosFijos, movimientos, error };
}

function EliminarPortafolioModal({
  portafolio,
  onClose,
}: {
  portafolio: Portafolio;
  onClose: () => void;
}) {
  const { eliminarPortafolio } = usePortafolios();
  const { trades, plazosFijos, movimientos, error: errorCarga } =
    useDatosPortafolio(portafolio.id);
  const [confirmado, setConfirmado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargando = !trades || !plazosFijos || !movimientos;
  const abiertas = trades?.filter((t) => t.estado === "abierta") ?? [];
  const tieneAbiertas = abiertas.length > 0;

  const { balance: balanceFuturos } = trades && movimientos
    ? calcularBalanceFuturos(trades, movimientos)
    : { balance: 0 };

  const plazosFijosPorDivisa = (plazosFijos ?? []).reduce<Record<string, number>>(
    (acc, p) => {
      acc[p.divisa] = (acc[p.divisa] ?? 0) + p.monto;
      return acc;
    },
    {}
  );

  const cerradas = trades?.filter((t) => t.estado === "cerrada").length ?? 0;

  const handleBorrar = async () => {
    setBorrando(true);
    setError(null);
    try {
      await eliminarPortafolio(portafolio.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar el portafolio.");
      setBorrando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          Borrar portafolio &ldquo;{portafolio.nombre}&rdquo;
        </h2>

        {errorCarga && (
          <p className="mt-3 rounded-md border border-risk-red-border bg-risk-red-bg px-3 py-2 text-xs text-risk-red">
            {errorCarga}
          </p>
        )}

        {cargando && !errorCarga && (
          <p className="mt-4 text-sm text-foreground-muted">Cargando datos...</p>
        )}

        {!cargando && tieneAbiertas && (
          <div className="mt-4 rounded-md border border-risk-red-border bg-risk-red-bg px-3 py-3 text-sm text-risk-red">
            Este portafolio tiene {abiertas.length} operación
            {abiertas.length === 1 ? "" : "es"} abierta
            {abiertas.length === 1 ? "" : "s"}. Ciérrela
            {abiertas.length === 1 ? "" : "s"} en{" "}
            <span className="font-medium">Posiciones Abiertas</span> antes de poder
            borrar este portafolio.
          </div>
        )}

        {!cargando && !tieneAbiertas && (
          <>
            <p className="mt-3 text-xs text-foreground-muted">
              Se va a borrar de forma permanente todo lo cargado en este
              portafolio:
            </p>
            <ul className="mt-2 flex flex-col gap-1 rounded-md border border-border bg-surface-muted p-3 text-sm text-foreground">
              <li>
                Cuenta de Futuros:{" "}
                <span
                  className={
                    balanceFuturos >= 0 ? "text-risk-green" : "text-risk-red"
                  }
                >
                  {formatMonto(balanceFuturos, "USDT")}
                </span>
              </li>
              {Object.entries(plazosFijosPorDivisa).length === 0 ? (
                <li className="text-foreground-muted">Sin plazos fijos cargados</li>
              ) : (
                Object.entries(plazosFijosPorDivisa).map(([divisa, monto]) => (
                  <li key={divisa}>
                    Plazos fijos ({divisa}):{" "}
                    {formatMonto(monto, divisa as "USD" | "ARS")}
                  </li>
                ))
              )}
              <li className="text-foreground-muted">
                {cerradas} operación{cerradas === 1 ? "" : "es"} cerrada
                {cerradas === 1 ? "" : "s"} en el historial
              </li>
            </ul>

            <label className="mt-4 flex items-start gap-2 text-xs text-foreground-muted">
              <input
                type="checkbox"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
                className="mt-0.5"
              />
              Entiendo que esto borra permanentemente todas las operaciones,
              plazos fijos y movimientos de este portafolio, y no se puede
              deshacer.
            </label>
          </>
        )}

        {error && (
          <p className="mt-3 rounded-md border border-risk-red-border bg-risk-red-bg px-3 py-2 text-xs text-risk-red">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={borrando}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          {!cargando && !tieneAbiertas && (
            <button
              type="button"
              onClick={handleBorrar}
              disabled={borrando || !confirmado}
              className="flex-1 rounded-md bg-risk-red px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {borrando ? "Borrando..." : "Borrar portafolio"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GestionPortafolios() {
  const { portafolios, renombrarPortafolio } = usePortafolios();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [portafolioABorrar, setPortafolioABorrar] = useState<Portafolio | null>(
    null
  );

  const iniciarEdicion = (p: Portafolio) => {
    setEditandoId(p.id);
    setNombreEditado(p.nombre);
  };

  const guardarEdicion = async (id: string) => {
    if (nombreEditado.trim()) {
      await renombrarPortafolio(id, nombreEditado.trim());
    }
    setEditandoId(null);
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold text-foreground">Mis Portafolios</h2>
      <ul className="flex flex-col divide-y divide-border">
        {portafolios.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2">
            {editandoId === p.id ? (
              <input
                autoFocus
                className={`${inputClasses} max-w-xs`}
                value={nombreEditado}
                onChange={(e) => setNombreEditado(e.target.value)}
                onBlur={() => guardarEdicion(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") guardarEdicion(p.id);
                  if (e.key === "Escape") setEditandoId(null);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => iniciarEdicion(p)}
                className="text-sm text-foreground hover:underline"
              >
                {p.nombre}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPortafolioABorrar(p)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-risk-red hover:bg-risk-red-bg"
            >
              Borrar
            </button>
          </li>
        ))}
      </ul>

      {portafolioABorrar && (
        <EliminarPortafolioModal
          portafolio={portafolioABorrar}
          onClose={() => setPortafolioABorrar(null)}
        />
      )}
    </section>
  );
}

export default function PortafolioPage() {
  const { portafolios, portafolioActivoId } = usePortafolios();
  const { trades, loading: loadingTrades, error: errorTrades } = useTrades();
  const { movimientos, loading: loadingMovs, error: errorMovs } =
    useMovimientosFuturos();

  const loading = loadingTrades || loadingMovs;
  const error = errorTrades || errorMovs;
  const modoTodos = portafolioActivoId === TODOS_LOS_PORTAFOLIOS;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <h1 className="text-lg font-semibold text-foreground">Portafolio</h1>

      <GestionPortafolios />

      {error && (
        <div className="rounded-lg border border-risk-red-border bg-risk-red-bg p-4 text-sm text-risk-red">
          {error}
        </div>
      )}

      {loading && !error && (
        <p className="text-sm text-foreground-muted">Cargando portafolio...</p>
      )}

      {!loading && !error && !modoTodos && (
        <SeccionesPortafolio
          trades={trades}
          movimientos={movimientos}
          mostrarFormularioMovimiento
        />
      )}

      {!loading && !error && modoTodos && (
        <>
          {portafolios.length === 0 && (
            <p className="text-sm text-foreground-muted">
              Todavía no tiene portafolios creados.
            </p>
          )}
          {portafolios.map((p) => (
            <div key={p.id} className="flex flex-col gap-4">
              <h2 className="border-b border-border pb-2 text-base font-semibold text-foreground">
                {p.nombre}
              </h2>
              <SeccionesPortafolio
                trades={trades.filter((t) => t.portafolioId === p.id)}
                movimientos={movimientos.filter((m) => m.portafolioId === p.id)}
                mostrarFormularioMovimiento={false}
              />
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Registrar movimiento de Futuros
            </h2>
            <NuevoMovimientoForm />
          </div>
        </>
      )}
    </div>
  );
}
