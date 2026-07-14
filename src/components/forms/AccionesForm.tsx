"use client";

import { useState } from "react";
import Link from "next/link";
import { useTrades } from "@/context/TradesContext";
import { analizarRiesgoPosicionFija } from "@/utils/riskCalculations";
import type { SubTipoAccion } from "@/types/trading";
import AssetAutocomplete from "../AssetAutocomplete";
import RiskPanel from "../RiskPanel";
import { inputClasses, labelClasses } from "../formStyles";
import { usePortafolioDestino } from "./usePortafolioDestino";
import { mensajeCamposFaltantes } from "./formValidation";

interface FormState {
  activo: string;
  subTipoActivo: SubTipoAccion;
  fechaEntrada: string;
  notas: string;
  // Los precios se guardan como texto para poder tipear decimales que arrancan
  // en 0 (ej. "0.5"): con estado numérico, el 0 intermedio colapsa a "" y se
  // pierde el inicio del decimal. Se convierten a número al calcular/guardar.
  precioEntrada: string;
  precioStopLoss: string;
  precioTakeProfit: string;
  cantidad: number;
}

const estadoInicial: FormState = {
  activo: "",
  subTipoActivo: "usd",
  fechaEntrada: new Date().toISOString().slice(0, 10),
  notas: "",
  precioEntrada: "",
  precioStopLoss: "",
  precioTakeProfit: "",
  cantidad: 1,
};

export default function AccionesForm() {
  const { addTrade } = useTrades();
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

  const esCedear = data.subTipoActivo === "cedear";
  const divisa = esCedear ? "ARS" : "USD";

  const precioEntradaNum = parseFloat(data.precioEntrada);
  const precioStopLossNum = parseFloat(data.precioStopLoss);
  const precioTakeProfitNum = parseFloat(data.precioTakeProfit);

  const camposIncompletos = !precioEntradaNum || !data.cantidad || !portafolioId;

  const camposFaltantes = (): string[] => {
    const faltantes: string[] = [];
    if (data.activo.trim().length < 2) faltantes.push("Activo (mínimo 2 caracteres)");
    if (!data.cantidad || data.cantidad <= 0)
      faltantes.push(`Cantidad de ${esCedear ? "CEDEARs" : "acciones"}`);
    if (!precioEntradaNum || precioEntradaNum <= 0) faltantes.push("Precio de entrada");
    return faltantes;
  };

  const analizar = () =>
    analizarRiesgoPosicionFija({
      precioEntrada: precioEntradaNum,
      precioStopLoss: precioStopLossNum || undefined,
      precioTakeProfit: precioTakeProfitNum || undefined,
      cantidad: data.cantidad,
      tipoOperacion: "long",
    });

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
      const analysis = analizar();
      await addTrade(
        {
          activo: data.activo,
          tipoActivo: "acciones",
          subTipoActivo: data.subTipoActivo,
          divisa,
          tipoOperacion: "long",
          fechaEntrada: data.fechaEntrada,
          precioEntrada: precioEntradaNum,
          precioStopLoss: precioStopLossNum || undefined,
          precioTakeProfit: precioTakeProfitNum || undefined,
          cantidad: analysis.tamañoPosicion,
          estado: "abierta",
          ratioRiesgoBeneficio: analysis.ratioRiesgoBeneficio,
          porcentajeRiesgoOperacion: analysis.perdidaMaximaPorcentaje,
          notas: data.notas,
        },
        portafolioId
      );
      setError(null);
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar la operación."
      );
      setSaved(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6"
      >
        <h2 className="text-sm font-semibold text-foreground">
          Nueva operación — Acciones
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {selectorField}

          <AssetAutocomplete
            value={data.activo}
            onChange={(v) => setField("activo", v)}
            onSelect={() => {}}
            placeholder="AAPL, GGAL.BA..."
            tipo="stock"
            mercado={data.subTipoActivo}
          />

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Instrumento</span>
            <div className="flex gap-2 pt-1.5">
              {(["usd", "cedear"] as const).map((tipo) => (
                <button
                  type="button"
                  key={tipo}
                  onClick={() => setField("subTipoActivo", tipo)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                    data.subTipoActivo === tipo
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-border bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {tipo === "usd" ? "Acción (USD)" : "CEDEAR (ARS)"}
                </button>
              ))}
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Fecha de entrada</span>
            <input
              type="date"
              className={inputClasses}
              value={data.fechaEntrada}
              onChange={(e) => setField("fechaEntrada", e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>
              Cantidad de {esCedear ? "CEDEARs" : "acciones"}
            </span>
            <input
              type="number"
              className={inputClasses}
              value={data.cantidad || ""}
              onChange={(e) => setField("cantidad", Number(e.target.value))}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>
              Precio {esCedear ? "por CEDEAR" : "de entrada"} ({divisa})
            </span>
            <input
              type="number"
              step="any"
              className={inputClasses}
              value={data.precioEntrada}
              onChange={(e) => setField("precioEntrada", e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Precio Stop Loss (opcional)</span>
            <input
              type="number"
              step="any"
              className={inputClasses}
              value={data.precioStopLoss}
              onChange={(e) => setField("precioStopLoss", e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Precio Take Profit (opcional)</span>
            <input
              type="number"
              step="any"
              className={inputClasses}
              value={data.precioTakeProfit}
              onChange={(e) => setField("precioTakeProfit", e.target.value)}
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
          {guardando ? "Guardando..." : "Guardar operación"}
        </button>

        {saved && (
          <p className="text-xs text-risk-green">
            Operación guardada correctamente, visualícela en{" "}
            <Link
              href={`/posiciones-abiertas?tab=${esCedear ? "cedears" : "acciones"}`}
              className="font-semibold underline"
            >
              Posiciones Abiertas
            </Link>
            .
          </p>
        )}
        {error && <p className="text-xs text-risk-red">{error}</p>}
      </form>

      <RiskPanel
        camposIncompletos={camposIncompletos}
        analizar={analizar}
        divisa={divisa}
        claseActivo="acciones"
      />
    </div>
  );
}
