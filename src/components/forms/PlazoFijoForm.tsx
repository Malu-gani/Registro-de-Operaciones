"use client";

import { useState } from "react";
import Link from "next/link";
import { usePlazosFijos } from "@/context/PlazosFijosContext";
import { calcularPlazoFijo } from "@/utils/riskCalculations";
import { inputClasses, labelClasses } from "../formStyles";
import { usePortafolioDestino } from "./usePortafolioDestino";
import { mensajeCamposFaltantes } from "./formValidation";

interface FormState {
  monto: number;
  divisa: "USD" | "ARS";
  tasaTna: number;
  plazoDias: number;
  fechaInicio: string;
  notas: string;
}

const estadoInicial: FormState = {
  monto: 0,
  divisa: "ARS",
  tasaTna: 0,
  plazoDias: 30,
  fechaInicio: new Date().toISOString().slice(0, 10),
  notas: "",
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

export default function PlazoFijoForm() {
  const { addPlazoFijo } = usePlazosFijos();
  const { portafolioId, selectorField } = usePortafolioDestino();
  const [data, setData] = useState<FormState>(estadoInicial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const setField = <K extends keyof FormState>(
    field: K,
    value: FormState[K]
  ) => {
    setData((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const camposIncompletos =
    !data.monto ||
    !data.tasaTna ||
    !data.plazoDias ||
    !data.fechaInicio ||
    !portafolioId;

  const camposFaltantes = (): string[] => {
    const faltantes: string[] = [];
    if (!data.monto || data.monto <= 0) faltantes.push("Monto");
    if (!data.tasaTna || data.tasaTna <= 0) faltantes.push("Tasa nominal anual (TNA)");
    if (!data.plazoDias || data.plazoDias <= 0) faltantes.push("Plazo (días)");
    if (!data.fechaInicio) faltantes.push("Fecha de inicio");
    return faltantes;
  };

  const formatMonto = (valor: number) =>
    data.divisa === "ARS" ? formatoARS.format(valor) : formatoUSD.format(valor);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portafolioId) return;
    const faltantes = camposFaltantes();
    if (faltantes.length > 0) {
      setError(mensajeCamposFaltantes(faltantes));
      setSaved(false);
      return;
    }
    setGuardando(true);
    try {
      const { interesEstimado, fechaVencimiento } = calcularPlazoFijo(
        data.monto,
        data.tasaTna,
        data.plazoDias,
        data.fechaInicio
      );
      await addPlazoFijo(
        {
          monto: data.monto,
          divisa: data.divisa,
          tasaTna: data.tasaTna,
          plazoDias: data.plazoDias,
          fechaInicio: data.fechaInicio,
          fechaVencimiento,
          interesEstimado,
          notas: data.notas,
        },
        portafolioId
      );
      setError(null);
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el plazo fijo."
      );
      setSaved(false);
    } finally {
      setGuardando(false);
    }
  };

  const resumen = !camposIncompletos
    ? calcularPlazoFijo(data.monto, data.tasaTna, data.plazoDias, data.fechaInicio)
    : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6"
      >
        <h2 className="text-sm font-semibold text-foreground">
          Nuevo plazo fijo
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {selectorField}

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Divisa</span>
            <div className="flex gap-2 pt-1.5">
              {(["ARS", "USD"] as const).map((div) => (
                <button
                  type="button"
                  key={div}
                  onClick={() => setField("divisa", div)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                    data.divisa === div
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-border bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {div === "ARS" ? "Pesos (ARS)" : "Dólares (USD)"}
                </button>
              ))}
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Monto ({data.divisa})</span>
            <input
              type="number"
              className={inputClasses}
              value={data.monto || ""}
              onChange={(e) => setField("monto", Number(e.target.value))}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Tasa nominal anual (TNA %)</span>
            <input
              type="number"
              step="0.1"
              className={inputClasses}
              value={data.tasaTna || ""}
              onChange={(e) => setField("tasaTna", Number(e.target.value))}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Plazo (días)</span>
            <input
              type="number"
              className={inputClasses}
              value={data.plazoDias || ""}
              onChange={(e) => setField("plazoDias", Number(e.target.value))}
            />
          </label>

          <label className="col-span-2 flex flex-col gap-1">
            <span className={labelClasses}>Fecha de inicio</span>
            <input
              type="date"
              className={inputClasses}
              value={data.fechaInicio}
              onChange={(e) => setField("fechaInicio", e.target.value)}
            />
          </label>

          <label className="col-span-2 flex flex-col gap-1">
            <span className={labelClasses}>Notas</span>
            <textarea
              className={inputClasses}
              rows={3}
              value={data.notas}
              onChange={(e) => setField("notas", e.target.value)}
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={guardando}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
        >
          {guardando ? "Guardando..." : "Guardar plazo fijo"}
        </button>

        {saved && (
          <p className="text-xs text-risk-green">
            Plazo fijo guardado correctamente, visualícelo en{" "}
            <Link
              href="/posiciones-abiertas?tab=plazos-fijos"
              className="font-semibold underline"
            >
              Posiciones Abiertas
            </Link>
            . Va a pasar al Historial automáticamente al llegar la fecha de
            vencimiento.
          </p>
        )}
        {error && <p className="text-xs text-risk-red">{error}</p>}
      </form>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-foreground">Resumen</h2>
        {!resumen ? (
          <p className="mt-4 text-sm text-foreground-muted">
            Complete monto, TNA, plazo y fecha de inicio para ver el interés
            estimado.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-lg border border-risk-green-border bg-risk-green-bg p-3">
              <p className="text-xs font-medium text-risk-green">
                Interés estimado
              </p>
              <p className="mt-1 text-lg font-semibold text-risk-green">
                +{formatMonto(resumen.interesEstimado)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-muted p-3">
              <p className="text-xs text-foreground-muted">
                Monto total al vencimiento
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {formatMonto(data.monto + resumen.interesEstimado)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-muted p-3">
              <p className="text-xs text-foreground-muted">
                Fecha de vencimiento
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {resumen.fechaVencimiento}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
