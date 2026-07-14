"use client";

import { useEffect, useState } from "react";
import { usePortafolios } from "@/context/PortafoliosContext";
import { fetchTrades } from "@/lib/tradesApi";
import { fetchPlazosFijos } from "@/lib/plazosFijosApi";
import { fetchSaldos } from "@/lib/cuentasApi";
import { inputClasses } from "@/components/formStyles";
import { formatMonto, balanceFuturos } from "@/components/portafolio/utils";
import type { Portafolio, Trade } from "@/types/trading";

/** Datos que necesita el modal de borrado, siempre traídos frescos del portafolio en cuestión (no depende de cuál esté activo en el Navbar). */
function useDatosPortafolio(portafolioId: string) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [plazosFijos, setPlazosFijos] = useState<{ monto: number; divisa: "USD" | "ARS" }[] | null>(
    null
  );
  const [disponibleFuturos, setDisponibleFuturos] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchTrades(portafolioId),
      fetchPlazosFijos(portafolioId),
      fetchSaldos(portafolioId),
    ])
      .then(([t, p, saldos]) => {
        setTrades(t);
        setPlazosFijos(p);
        setDisponibleFuturos(
          saldos.find((s) => s.cuenta === "usdt_futuros")?.disponible ?? 0
        );
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudieron cargar los datos del portafolio.")
      );
  }, [portafolioId]);

  return { trades, plazosFijos, disponibleFuturos, error };
}

function EliminarPortafolioModal({
  portafolio,
  onClose,
}: {
  portafolio: Portafolio;
  onClose: () => void;
}) {
  const { eliminarPortafolio } = usePortafolios();
  const { trades, plazosFijos, disponibleFuturos, error: errorCarga } =
    useDatosPortafolio(portafolio.id);
  const [confirmado, setConfirmado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargando = !trades || !plazosFijos || disponibleFuturos === null;
  const abiertas = trades?.filter((t) => t.estado === "abierta") ?? [];
  const tieneAbiertas = abiertas.length > 0;

  const { balance: saldoFuturos } =
    trades && disponibleFuturos !== null
      ? balanceFuturos(disponibleFuturos, trades)
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
                    saldoFuturos >= 0 ? "text-risk-green" : "text-risk-red"
                  }
                >
                  {formatMonto(saldoFuturos, "USDT")}
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

export default function GestionPortafolios() {
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
