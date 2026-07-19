"use client";

import { useEffect, useState } from "react";
import { TODOS_LOS_PORTAFOLIOS, usePortafolios } from "@/context/PortafoliosContext";
import { fetchTrades } from "@/lib/tradesApi";
import { fetchPlazosFijos } from "@/lib/plazosFijosApi";
import { fetchSaldos } from "@/lib/cuentasApi";
import { comprometidoPorCuenta } from "@/utils/cuentas";
import { labelMercado } from "@/utils/tipoMercado";
import { inputClasses } from "@/components/formStyles";
import { formatMonto } from "@/components/portafolio/utils";
import CrearPortafolioModal from "@/components/portafolio/CrearPortafolioModal";
import type { CuentaId, Divisa, Portafolio, PlazoFijo, SaldoCuenta, Trade } from "@/types/trading";

const CUENTAS_INFO: { id: CuentaId; label: string; divisa: Divisa }[] = [
  { id: "ars", label: "Pesos (ARS)", divisa: "ARS" },
  { id: "usd", label: "Dólares (USD)", divisa: "USD" },
  { id: "usdt_spot", label: "Cripto Spot (USDT)", divisa: "USDT" },
  { id: "usdt_futuros", label: "Cripto Futuros (USDT)", divisa: "USDT" },
];

function IconoLapiz() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="h-4 w-4"
    >
      <path
        d="M13.5 3.5l3 3L6 17H3v-3L13.5 3.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconoCheck() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-4 w-4 shrink-0 text-brand"
    >
      <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoFlechaAbajo() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-4 w-4 transition-transform group-hover:translate-y-0.5"
    >
      <path d="M10 4v12M5 11l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Ancestro scrolleable más cercano (el `<main>` del layout, que tiene el
 * overflow), para no depender de la estructura exacta del DOM. */
function ancestroScrolleable(el: HTMLElement): HTMLElement {
  let nodo = el.parentElement;
  while (nodo) {
    const oy = getComputedStyle(nodo).overflowY;
    if ((oy === "auto" || oy === "scroll") && nodo.scrollHeight > nodo.clientHeight) {
      return nodo;
    }
    nodo = nodo.parentElement;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

/**
 * Lleva suavemente a la sección "Distribución de {portafolio}" (en /cuenta) y
 * le da un realce breve al llegar. Scrollea el contenedor real (no
 * `scrollIntoView`, que en Chrome no anima contenedores anidados con `smooth`).
 * El destino existe solo cuando hay un portafolio específico con saldos
 * cargados; si no está, no hace nada.
 */
function irADistribucion() {
  const el = document.getElementById("distribucion-portafolio");
  if (!el) return;
  const cont = ancestroScrolleable(el);
  const destino =
    el.getBoundingClientRect().top -
    cont.getBoundingClientRect().top +
    cont.scrollTop -
    16;
  cont.scrollTo({ top: destino, behavior: "smooth" });
  el.classList.add("scroll-destacado");
  window.setTimeout(() => el.classList.remove("scroll-destacado"), 1400);
}

/** Datos que necesita el modal de borrado, siempre traídos frescos del portafolio en cuestión (no depende de cuál esté activo en el Navbar). */
function useDatosPortafolio(portafolioId: string) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [plazosFijos, setPlazosFijos] = useState<PlazoFijo[] | null>(null);
  const [saldos, setSaldos] = useState<SaldoCuenta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchTrades(portafolioId),
      fetchPlazosFijos(portafolioId),
      fetchSaldos(portafolioId),
    ])
      .then(([t, p, s]) => {
        setTrades(t);
        setPlazosFijos(p);
        setSaldos(s);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudieron cargar los datos del portafolio.")
      );
  }, [portafolioId]);

  return { trades, plazosFijos, saldos, error };
}

function EliminarPortafolioModal({
  portafolio,
  onClose,
}: {
  portafolio: Portafolio;
  onClose: () => void;
}) {
  const { eliminarPortafolio } = usePortafolios();
  const { trades, plazosFijos, saldos, error: errorCarga } =
    useDatosPortafolio(portafolio.id);
  const [confirmado, setConfirmado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargando = !trades || !plazosFijos || !saldos;
  const abiertas = trades?.filter((t) => t.estado === "abierta") ?? [];
  const tieneAbiertas = abiertas.length > 0;

  // Comprometido = margen de operaciones abiertas + plazos fijos aún no
  // liquidados (mismo criterio que /cuenta: sigue comprometido aunque venza).
  const comprometido = comprometidoPorCuenta(
    trades ?? [],
    (plazosFijos ?? []).filter((pf) => pf.estado !== "liquidado")
  );
  const balancesPorCuenta = CUENTAS_INFO.map((c) => {
    const disponible = saldos?.find((s) => s.cuenta === c.id)?.disponible ?? 0;
    return { ...c, total: disponible + comprometido[c.id] };
  }).filter((c) => c.total !== 0);

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
              {balancesPorCuenta.length === 0 ? (
                <li className="text-foreground-muted">Sin saldos cargados</li>
              ) : (
                balancesPorCuenta.map((c) => (
                  <li key={c.id}>
                    {c.label}:{" "}
                    <span
                      className={c.total >= 0 ? "text-risk-green" : "text-risk-red"}
                    >
                      {formatMonto(c.total, c.divisa)}
                    </span>
                  </li>
                ))
              )}
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

export default function GestionPortafolios() {
  const {
    portafolios,
    renombrarPortafolio,
    portafolioActivoId,
    setPortafolioActivoId,
  } = usePortafolios();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [portafolioABorrar, setPortafolioABorrar] = useState<Portafolio | null>(
    null
  );
  const [mostrarCrear, setMostrarCrear] = useState(false);

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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Mis Portafolios</h2>
        <button
          type="button"
          onClick={() => setMostrarCrear(true)}
          className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:opacity-90"
        >
          + Nuevo portafolio
        </button>
      </div>

      <p className="text-xs text-foreground-muted">
        Elija un portafolio para verlo en el resto de la app, o edite su
        nombre y elimínelo desde acá.
      </p>

      {portafolios.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          Todavía no tiene portafolios cargados.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* "Todos los portafolios": vista combinada, sin editar ni borrar. */}
          <div
            onClick={() => setPortafolioActivoId(TODOS_LOS_PORTAFOLIOS)}
            className={`card-hover flex cursor-pointer flex-col gap-2 rounded-xl border bg-surface p-4 ${
              portafolioActivoId === TODOS_LOS_PORTAFOLIOS
                ? "border-brand bg-brand/5"
                : "border-border"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">
                Todos los portafolios
              </span>
              {portafolioActivoId === TODOS_LOS_PORTAFOLIOS && <IconoCheck />}
            </div>
            <p className="text-xs text-foreground-muted">
              Vista combinada de todos tus portafolios.
            </p>
          </div>

          {portafolios.map((p) => {
            const esActivo = p.id === portafolioActivoId;
            const editando = editandoId === p.id;
            return (
              <div
                key={p.id}
                onClick={() => !editando && setPortafolioActivoId(p.id)}
                className={`card-hover flex cursor-pointer flex-col justify-between gap-3 rounded-xl border bg-surface p-4 ${
                  esActivo ? "border-brand bg-brand/5" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  {editando ? (
                    <input
                      autoFocus
                      className={`${inputClasses} min-w-0`}
                      value={nombreEditado}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setNombreEditado(e.target.value)}
                      onBlur={() => guardarEdicion(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") guardarEdicion(p.id);
                        if (e.key === "Escape") setEditandoId(null);
                      }}
                    />
                  ) : (
                    <>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {p.nombre}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            iniciarEdicion(p);
                          }}
                          aria-label={`Editar nombre de ${p.nombre}`}
                          className="shrink-0 rounded-md p-1 text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                        >
                          <IconoLapiz />
                        </button>
                      </div>
                      {esActivo && <IconoCheck />}
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
                    {labelMercado(p.tipoMercado)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPortafolioABorrar(p);
                    }}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-risk-red hover:bg-risk-red-bg"
                  >
                    Borrar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {portafolioActivoId !== TODOS_LOS_PORTAFOLIOS && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={irADistribucion}
            className="group inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-5 py-2.5 text-sm font-semibold text-brand transition-all hover:bg-brand/20 hover:shadow-[0_10px_28px_-14px_var(--glow)]"
          >
            Dirigite a la distribución de tu portfolio
            <IconoFlechaAbajo />
          </button>
        </div>
      )}

      {portafolioABorrar && (
        <EliminarPortafolioModal
          portafolio={portafolioABorrar}
          onClose={() => setPortafolioABorrar(null)}
        />
      )}

      {mostrarCrear && (
        <CrearPortafolioModal onClose={() => setMostrarCrear(false)} />
      )}
    </section>
  );
}
