"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTrades } from "@/context/TradesContext";
import { usePlazosFijos } from "@/context/PlazosFijosContext";
import { useCuentas } from "@/context/CuentasContext";
import { TODOS_LOS_PORTAFOLIOS, usePortafolios } from "@/context/PortafoliosContext";
import { comprometidoPorCuenta } from "@/utils/cuentas";
import { cuentasDeMercado } from "@/utils/tipoMercado";
import { useListaPaginada, ControlesListaPaginada } from "@/components/ListaPaginada";
import SeccionesPortafolio from "@/components/portafolio/SeccionesPortafolio";
import GestionPortafolios from "@/components/portafolio/GestionPortafolios";
import { inputClasses, labelClasses } from "@/components/formStyles";
import type { CuentaId, Divisa } from "@/types/trading";

const CUENTAS: { id: CuentaId; label: string; divisa: Divisa }[] = [
  { id: "ars", label: "Pesos (ARS)", divisa: "ARS" },
  { id: "usd", label: "Dólares (USD)", divisa: "USD" },
  { id: "usdt_spot", label: "Cripto Spot (USDT)", divisa: "USDT" },
  { id: "usdt_futuros", label: "Futuros (USDT)", divisa: "USDT" },
];

const TIPO_LABEL: Record<string, string> = {
  deposito: "Depósito",
  retiro: "Retiro",
  ajuste_inicial: "Saldo inicial",
  apertura: "Apertura de operación",
  cierre: "Cierre de operación",
  plazo_apertura: "Apertura de plazo fijo",
  plazo_liquidacion: "Liquidación de plazo fijo",
};

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
  if (divisa === "USDT")
    return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(valor)} USDT`;
  return formatoUSD.format(valor);
}

function divisaDeCuenta(cuenta: CuentaId): Divisa {
  return CUENTAS.find((c) => c.id === cuenta)?.divisa ?? "USDT";
}

/** Barra Disponible vs Comprometido de una cuenta (oculta si no hay capital cargado). */
function BarraComprometido({
  disponible,
  comprometido,
}: {
  disponible: number;
  comprometido: number;
}) {
  const total = disponible + comprometido;
  if (total <= 0) return null;

  const pctDisponible = (Math.max(disponible, 0) / total) * 100;
  const pctComprometido = 100 - pctDisponible;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full"
          style={{ width: `${pctDisponible}%`, background: "var(--chart-1)" }}
        />
        <div
          className="h-full"
          style={{ width: `${pctComprometido}%`, background: "var(--chart-2)" }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-foreground-muted">
        <span>{pctDisponible.toFixed(0)}% Disponible</span>
        <span>{pctComprometido.toFixed(0)}% Comprometido</span>
      </div>
    </div>
  );
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Redondea a 3 decimales solo para mostrar en el input de edición de saldos
 * (evita el ruido de punto flotante tipo 6526039.479452055). El valor exacto
 * de la base se sigue usando al guardar si el usuario no toca el campo — ver
 * `tocado` en SetupSaldos. Esto no toca la precisión de cantidades de cripto
 * en los formularios de operaciones, que son un campo distinto.
 */
function formatearParaInput(valor: number): string {
  return String(Number(valor.toFixed(3)));
}

/**
 * Panel para cargar los saldos de las cuentas del portafolio. Se usa en dos
 * modos: "inicial" (primera carga, "cargá tus saldos de hoy") y "edicion"
 * (botón "Editar saldos" sobre saldos ya cargados). En modo edición, los
 * inputs arrancan precargados con el Disponible actual y un campo dejado en
 * blanco CONSERVA ese valor (antes se pisaba a 0 sin avisar, ver
 * OPS-BUG-05). Para poner una cuenta en 0 hay que tipear el dígito 0.
 */
function SetupSaldos({
  portafolioId,
  cuentas,
  modo,
  valoresActuales,
  onListo,
  onCancelar,
}: {
  portafolioId: string;
  cuentas: typeof CUENTAS;
  modo: "inicial" | "edicion";
  valoresActuales: Record<CuentaId, number>;
  onListo: () => void;
  onCancelar?: () => void;
}) {
  const { setSaldoInicial } = useCuentas();
  const [valores, setValores] = useState<Record<CuentaId, string>>(() =>
    modo === "edicion"
      ? {
          ars: formatearParaInput(valoresActuales.ars),
          usd: formatearParaInput(valoresActuales.usd),
          usdt_spot: formatearParaInput(valoresActuales.usdt_spot),
          usdt_futuros: formatearParaInput(valoresActuales.usdt_futuros),
        }
      : { ars: "", usd: "", usdt_spot: "", usdt_futuros: "" }
  );
  // Un campo que el usuario nunca tocó manda el valor EXACTO de la base al
  // guardar, no lo que se ve en pantalla (que está redondeado a 3 decimales
  // solo para lectura). Evita perder precisión en cuentas que no se editaron.
  const [tocado, setTocado] = useState<Record<CuentaId, boolean>>({
    ars: false,
    usd: false,
    usdt_spot: false,
    usdt_futuros: false,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  /** Blanco conserva el valor previo (edición) o vale 0 (carga inicial). */
  const montoResuelto = (cuentaId: CuentaId): number => {
    if (modo === "edicion" && !tocado[cuentaId]) return valoresActuales[cuentaId];
    const raw = valores[cuentaId].trim();
    if (raw === "") return modo === "edicion" ? valoresActuales[cuentaId] : 0;
    const monto = parseFloat(raw);
    return Number.isFinite(monto) ? monto : valoresActuales[cuentaId] ?? 0;
  };

  const cambios = cuentas
    .map((c) => ({ cuenta: c, anterior: valoresActuales[c.id], nuevo: montoResuelto(c.id) }))
    .filter((c) => modo === "inicial" || c.anterior !== c.nuevo);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      for (const c of cuentas) {
        await setSaldoInicial(portafolioId, c.id, montoResuelto(c.id));
      }
      setConfirmando(false);
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar los saldos.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {modo === "inicial" ? "Cargá tus saldos de hoy" : "Editar saldos"}
        </h2>
        <p className="mt-1 text-xs text-foreground-muted">
          {modo === "inicial"
            ? "Indicá cuánto tenés disponible hoy en cada cuenta. Lo que ya está invertido en posiciones abiertas queda como Comprometido; esto es solo tu capital libre. Podés dejar en 0 lo que no uses."
            : "Un campo que dejes en blanco conserva su valor actual. Para poner una cuenta en 0, tipeá el dígito 0."}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cuentas.map((c) => (
          <label key={c.id} className="flex flex-col gap-1">
            <span className={labelClasses}>{c.label}</span>
            <input
              type="number"
              step="any"
              className={inputClasses}
              value={valores[c.id]}
              onChange={(e) => {
                setValores((prev) => ({ ...prev, [c.id]: e.target.value }));
                setTocado((prev) => ({ ...prev, [c.id]: true }));
              }}
              placeholder="0"
            />
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-risk-red">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={guardando}
          className="self-start rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
        >
          {modo === "inicial" ? "Guardar saldos iniciales" : "Guardar edición de saldos"}
        </button>
        {modo === "edicion" && onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            disabled={guardando}
            className="self-start rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted disabled:opacity-60"
          >
            Cancelar
          </button>
        )}
      </div>

      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
            <h3 className="text-sm font-semibold text-foreground">
              Confirmar {modo === "inicial" ? "carga de saldos" : "edición de saldos"}
            </h3>
            <p className="mt-2 text-xs text-foreground-muted">
              {modo === "inicial"
                ? "Se van a guardar estos saldos:"
                : cambios.length === 0
                  ? "No hay cambios: los saldos quedan como estaban."
                  : "Se van a actualizar estos saldos:"}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {(modo === "inicial"
                ? cuentas.map((c) => ({ cuenta: c, anterior: 0, nuevo: montoResuelto(c.id) }))
                : cambios
              ).map(({ cuenta, anterior, nuevo }) => (
                <div key={cuenta.id} className="flex items-center justify-between text-xs">
                  <span className="text-foreground-muted">{cuenta.label}</span>
                  {modo === "edicion" ? (
                    <span className="text-foreground">
                      {formatMonto(anterior, cuenta.divisa)} → {formatMonto(nuevo, cuenta.divisa)}
                    </span>
                  ) : (
                    <span className="text-foreground">{formatMonto(nuevo, cuenta.divisa)}</span>
                  )}
                </div>
              ))}
            </div>
            {error && <p className="mt-3 text-xs text-risk-red">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                disabled={guardando}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted disabled:opacity-60"
              >
                Volver / Modificar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
              >
                {guardando ? "Guardando..." : "Confirmar y Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Formulario de depósito/retiro para una cuenta. */
function DepositoRetiro({
  portafolioId,
  cuenta,
}: {
  portafolioId: string;
  cuenta: CuentaId;
}) {
  const { depositarRetirar } = useCuentas();
  const [tipo, setTipo] = useState<"deposito" | "retiro">("deposito");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) {
      setError("Ingresá un monto válido.");
      return;
    }
    if (fecha > hoyISO()) {
      setError("La fecha no puede ser futura.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await depositarRetirar(portafolioId, cuenta, tipo, montoNum, fecha);
      setMonto("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo registrar el movimiento.";
      setError(
        msg.includes("FONDOS_INSUFICIENTES")
          ? "No tenés Disponible suficiente para ese retiro."
          : msg.includes("FECHA_FUTURA")
            ? "La fecha no puede ser futura."
            : msg
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex gap-2">
        {(["deposito", "retiro"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium capitalize ${
              tipo === t
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border bg-surface-muted text-foreground-muted"
            }`}
          >
            {t === "deposito" ? "Depositar" : "Retirar"}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          step="any"
          className={inputClasses}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="Monto"
        />
        <input
          type="date"
          className={inputClasses}
          value={fecha}
          max={hoyISO()}
          onChange={(e) => setFecha(e.target.value)}
        />
      </div>
      {error && <p className="text-xs text-risk-red">{error}</p>}
      <button
        type="button"
        onClick={guardar}
        disabled={guardando}
        className="self-start rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
      >
        {guardando ? "Guardando..." : tipo === "deposito" ? "Confirmar depósito" : "Confirmar retiro"}
      </button>
    </div>
  );
}

export default function CuentaPage() {
  const searchParams = useSearchParams();
  const cuentaParam = searchParams.get("cuenta") as CuentaId | null;
  const { portafolios, portafolioActivoId } = usePortafolios();
  const { trades } = useTrades();
  const { plazosFijos } = usePlazosFijos();
  const { saldos, movimientos, disponibleDe, loading, error } = useCuentas();

  const [editandoSaldos, setEditandoSaldos] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState<CuentaId | null>(cuentaParam);
  const [filtroCuenta, setFiltroCuenta] = useState<CuentaId | "todas" | "plazos_fijos">(
    "todas"
  );

  const esPortafolioEspecifico = portafolioActivoId !== TODOS_LOS_PORTAFOLIOS;
  const portafolioActivo = portafolios.find((p) => p.id === portafolioActivoId);
  const nombrePortafolio = portafolioActivo?.nombre;

  // Cuentas que el portafolio admite según su tipo de mercado (Acciones ->
  // ARS/USD, Cripto -> USDT Spot/Futuros, Mixto -> todas).
  const cuentasVisibles = portafolioActivo
    ? CUENTAS.filter((c) =>
        cuentasDeMercado(portafolioActivo.tipoMercado).includes(c.id)
      )
    : CUENTAS;

  const tieneSaldosCargados = useMemo(
    () => saldos.some((s) => s.portafolioId === portafolioActivoId),
    [saldos, portafolioActivoId]
  );

  const comprometido = useMemo(() => {
    // El capital de un plazo fijo queda comprometido hasta que se liquida
    // (aunque ya haya vencido), no según la fecha.
    const plazosNoLiquidados = plazosFijos.filter((pf) => pf.estado !== "liquidado");
    return comprometidoPorCuenta(trades, plazosNoLiquidados);
  }, [trades, plazosFijos]);

  const hayMovimientosPlazo = useMemo(
    () =>
      movimientos.some(
        (m) => m.tipo === "plazo_apertura" || m.tipo === "plazo_liquidacion"
      ),
    [movimientos]
  );

  const movimientosFiltrados = useMemo(() => {
    if (filtroCuenta === "todas") return movimientos;
    if (filtroCuenta === "plazos_fijos") {
      return movimientos.filter(
        (m) => m.tipo === "plazo_apertura" || m.tipo === "plazo_liquidacion"
      );
    }
    return movimientos.filter((m) => m.cuenta === filtroCuenta);
  }, [movimientos, filtroCuenta]);

  const {
    visibles: movimientosVisibles,
    totalCount: totalMovimientos,
    mostrarVerMas,
    mostrarMinimizar,
    mostrarPaginador,
    pagina,
    totalPaginas,
    verMas,
    colapsar,
    irAPagina,
  } = useListaPaginada(movimientosFiltrados, {
    inicial: 5,
    tamanoPagina: 10,
    conMinimizar: true,
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">Cuenta</h1>

      {error && (
        <div className="rounded-lg border border-risk-red-border bg-risk-red-bg p-4 text-sm text-risk-red">
          {error}
        </div>
      )}

      <GestionPortafolios />

      {!esPortafolioEspecifico ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-foreground-muted">
          Elegí un portafolio específico en el selector de arriba para ver y
          administrar sus saldos. Cada portafolio lleva sus propias cuentas.
        </div>
      ) : !tieneSaldosCargados || editandoSaldos ? (
        <SetupSaldos
          portafolioId={portafolioActivoId}
          cuentas={cuentasVisibles}
          modo={tieneSaldosCargados ? "edicion" : "inicial"}
          valoresActuales={{
            ars: disponibleDe(portafolioActivoId, "ars"),
            usd: disponibleDe(portafolioActivoId, "usd"),
            usdt_spot: disponibleDe(portafolioActivoId, "usdt_spot"),
            usdt_futuros: disponibleDe(portafolioActivoId, "usdt_futuros"),
          }}
          onListo={() => setEditandoSaldos(false)}
          onCancelar={tieneSaldosCargados ? () => setEditandoSaldos(false) : undefined}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-foreground-muted">
              Saldos de{" "}
              <span className="text-foreground">{nombrePortafolio}</span>. El{" "}
              <span className="text-foreground">Disponible</span> es tu capital
              libre; el <span className="text-foreground">Comprometido</span>, lo
              invertido en posiciones abiertas y plazos fijos.
            </p>
            <button
              type="button"
              onClick={() => setEditandoSaldos(true)}
              className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:bg-surface-muted"
            >
              Editar saldos
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cuentasVisibles.map((c) => {
              const disponible = disponibleDe(portafolioActivoId, c.id);
              const comp = comprometido[c.id];
              const abierta = cuentaAbierta === c.id;
              return (
                <div
                  key={c.id}
                  className={`flex flex-col gap-3 rounded-xl border bg-surface p-5 ${
                    cuentaParam === c.id ? "border-brand" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{c.label}</p>
                    <button
                      type="button"
                      onClick={() => setCuentaAbierta(abierta ? null : c.id)}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-muted"
                    >
                      {abierta ? "Cerrar" : "Depositar / Retirar"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-foreground-muted">Disponible</p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                        {loading ? "…" : formatMonto(disponible, c.divisa)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-foreground-muted">Comprometido</p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground-muted">
                        {formatMonto(comp, c.divisa)}
                      </p>
                    </div>
                  </div>
                  {!loading && (
                    <BarraComprometido disponible={disponible} comprometido={comp} />
                  )}
                  {abierta && (
                    <DepositoRetiro portafolioId={portafolioActivoId} cuenta={c.id} />
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Historial de movimientos de la cuenta
            </h2>
            {movimientos.length === 0 ? (
              <p className="text-sm text-foreground-muted">
                Todavía no hay movimientos en este portafolio.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: "todas" as const, label: "Todas" },
                      ...cuentasVisibles.map((c) => ({ id: c.id, label: c.label })),
                      ...(hayMovimientosPlazo
                        ? [{ id: "plazos_fijos" as const, label: "Plazos Fijos" }]
                        : []),
                    ]
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFiltroCuenta(f.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        filtroCuenta === f.id
                          ? "border-brand bg-brand/10 text-foreground"
                          : "border-border text-foreground-muted hover:text-foreground"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {movimientosFiltrados.length === 0 ? (
                  <p className="text-sm text-foreground-muted">
                    No hay movimientos en esta cuenta.
                  </p>
                ) : (
                <>
                <div className="flex flex-col gap-3 md:hidden">
                  {movimientosVisibles.map((m) => {
                    const divisa = divisaDeCuenta(m.cuenta);
                    return (
                      <div
                        key={m.id}
                        className="animate-fade-in-row rounded-xl border border-border bg-surface p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">
                              {TIPO_LABEL[m.tipo] ?? m.tipo}
                            </p>
                            <p className="text-xs text-foreground-muted">
                              {CUENTAS.find((c) => c.id === m.cuenta)?.label ?? m.cuenta}{" "}
                              · {m.fecha}
                            </p>
                          </div>
                          <p
                            className={`shrink-0 text-right text-sm font-semibold tabular-nums ${
                              m.monto >= 0 ? "text-risk-green" : "text-risk-red"
                            }`}
                          >
                            {m.monto >= 0 ? "+" : "−"}
                            {formatMonto(Math.abs(m.monto), divisa)}
                          </p>
                        </div>
                        {m.notas && (
                          <p className="mt-2 border-t border-border pt-2 text-xs text-foreground-muted">
                            {m.notas}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-foreground-muted">
                        <th className="px-4 py-3 font-medium">Fecha</th>
                        <th className="px-4 py-3 font-medium">Cuenta</th>
                        <th className="px-4 py-3 font-medium">Tipo</th>
                        <th className="px-4 py-3 font-medium">Monto</th>
                        <th className="px-4 py-3 font-medium">Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimientosVisibles.map((m) => {
                        const divisa = divisaDeCuenta(m.cuenta);
                        return (
                          <tr
                            key={m.id}
                            className="animate-fade-in-row border-b border-border last:border-0"
                          >
                            <td className="px-4 py-3 text-foreground-muted">{m.fecha}</td>
                            <td className="px-4 py-3 text-foreground-muted">
                              {CUENTAS.find((c) => c.id === m.cuenta)?.label ?? m.cuenta}
                            </td>
                            <td className="px-4 py-3 text-foreground-muted">
                              {TIPO_LABEL[m.tipo] ?? m.tipo}
                            </td>
                            <td
                              className={`px-4 py-3 font-medium tabular-nums ${
                                m.monto >= 0 ? "text-risk-green" : "text-risk-red"
                              }`}
                            >
                              {m.monto >= 0 ? "+" : "−"}
                              {formatMonto(Math.abs(m.monto), divisa)}
                            </td>
                            <td className="px-4 py-3 text-foreground-muted">
                              {m.notas ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <ControlesListaPaginada
                  visiblesCount={movimientosVisibles.length}
                  totalCount={totalMovimientos}
                  mostrarVerMas={mostrarVerMas}
                  mostrarMinimizar={mostrarMinimizar}
                  mostrarPaginador={mostrarPaginador}
                  pagina={pagina}
                  totalPaginas={totalPaginas}
                  verMas={verMas}
                  colapsar={colapsar}
                  irAPagina={irAPagina}
                />
                </>
                )}
              </div>
            )}
          </div>

          <section
            id="distribucion-portafolio"
            className="flex scroll-mt-20 flex-col gap-8"
          >
            <h2 className="border-b border-border pb-2 text-base font-semibold text-foreground">
              Distribución de {nombrePortafolio}
            </h2>
            <SeccionesPortafolio
              portafolioId={portafolioActivoId}
              trades={trades}
              mostrarLinkCuenta={false}
            />
          </section>
        </>
      )}
    </div>
  );
}
