"use client";

import { useState } from "react";
import Link from "next/link";
import { useTrades } from "@/context/TradesContext";
import { useCuentas } from "@/context/CuentasContext";
import { analizarRiesgoApalancado } from "@/utils/riskCalculations";
import type { CuentaId, SubTipoCrypto } from "@/types/trading";
import AssetAutocomplete from "../AssetAutocomplete";
import RiskPanel from "../RiskPanel";
import { inputClasses, labelClasses } from "../formStyles";
import { usePortafolioDestino } from "./usePortafolioDestino";
import { mensajeCamposFaltantes } from "./formValidation";
import { admiteOperacion, mensajeOperacionNoAdmitida } from "@/utils/tipoMercado";
import MensajeFondosInsuficientes, { cuentaFaltante } from "./MensajeFondosInsuficientes";

interface FormState {
  activo: string;
  subTipoActivo: SubTipoCrypto;
  tipoOperacion: "long" | "short";
  fechaEntrada: string;
  notas: string;
  // Montos y precios se guardan como texto para poder tipear decimales que
  // arrancan en 0 (ej. "0.071"): con estado numérico, el 0 intermedio colapsa
  // a "" y se pierde el inicio del decimal. Se convierten a número al calcular.
  monto: string;
  apalancamiento: number;
  precioEntrada: string;
  precioStopLoss: string;
  precioTakeProfit: string;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const estadoInicial: FormState = {
  activo: "BTC",
  subTipoActivo: "futuros",
  tipoOperacion: "long",
  fechaEntrada: hoyISO(),
  notas: "",
  monto: "",
  apalancamiento: 1,
  precioEntrada: "",
  precioStopLoss: "",
  precioTakeProfit: "",
};

export default function CryptoForm() {
  const { addTrade } = useTrades();
  const { refrescar } = useCuentas();
  const { portafolioId, tipoMercado, selectorField } = usePortafolioDestino();
  const [data, setData] = useState<FormState>(estadoInicial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fondosCuenta, setFondosCuenta] = useState<CuentaId | null>(null);
  const [guardando, setGuardando] = useState(false);

  const setField = <K extends keyof FormState>(
    field: K,
    value: FormState[K]
  ) => {
    setData((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const esFuturos = data.subTipoActivo === "futuros";
  const apalancamientoEfectivo = esFuturos ? data.apalancamiento : 1;
  const tipoOperacionEfectivo = esFuturos ? data.tipoOperacion : "long";

  const montoNum = parseFloat(data.monto);
  const precioEntradaNum = parseFloat(data.precioEntrada);
  const precioStopLossNum = parseFloat(data.precioStopLoss);
  const precioTakeProfitNum = parseFloat(data.precioTakeProfit);

  const camposIncompletos =
    !precioEntradaNum ||
    !montoNum ||
    (esFuturos && !data.apalancamiento) ||
    !portafolioId;

  const camposFaltantes = (): string[] => {
    const faltantes: string[] = [];
    if (data.activo.trim().length < 2) faltantes.push("Activo (mínimo 2 caracteres)");
    if (!montoNum || montoNum <= 0) faltantes.push("Monto invertido");
    if (!precioEntradaNum || precioEntradaNum <= 0) faltantes.push("Precio de entrada");
    return faltantes;
  };

  const analizar = () =>
    analizarRiesgoApalancado({
      precioEntrada: precioEntradaNum,
      precioStopLoss: precioStopLossNum || undefined,
      precioTakeProfit: precioTakeProfitNum || undefined,
      monto: montoNum,
      apalancamiento: apalancamientoEfectivo,
      tipoOperacion: tipoOperacionEfectivo,
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
    if (data.fechaEntrada > hoyISO()) {
      setError("La fecha no puede ser futura.");
      setSaved(false);
      return;
    }
    if (tipoMercado && !admiteOperacion(tipoMercado, "crypto")) {
      setError(mensajeOperacionNoAdmitida(tipoMercado, "crypto"));
      setSaved(false);
      return;
    }
    setGuardando(true);
    setFondosCuenta(null);
    try {
      const analysis = analizar();
      await addTrade(
        {
          activo: data.activo,
          tipoActivo: "crypto",
          subTipoActivo: data.subTipoActivo,
          divisa: "USDT",
          apalancamiento: esFuturos ? data.apalancamiento : undefined,
          tipoOperacion: tipoOperacionEfectivo,
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
      await refrescar();
      setError(null);
      setSaved(true);
    } catch (e) {
      const cf = cuentaFaltante(e);
      if (cf) {
        setFondosCuenta(cf);
      } else {
        const msg = e instanceof Error ? e.message : "No se pudo guardar la operación.";
        setError(msg.includes("FECHA_FUTURA") ? "La fecha no puede ser futura." : msg);
      }
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
          Nueva operación — Cripto
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {selectorField}

          <AssetAutocomplete
            value={data.activo}
            onChange={(v) => setField("activo", v)}
            onSelect={() => {}}
            placeholder="BTC, ETH..."
            tipo="crypto"
          />

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Mercado</span>
            <div className="flex gap-2 pt-1.5">
              {(["futuros", "spot"] as const).map((tipo) => (
                <button
                  type="button"
                  key={tipo}
                  onClick={() => {
                    setField("subTipoActivo", tipo);
                    if (tipo === "spot") {
                      setField("tipoOperacion", "long");
                    }
                  }}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize ${
                    data.subTipoActivo === tipo
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-border bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {tipo}
                </button>
              ))}
            </div>
          </label>

          {esFuturos && (
          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Tipo</span>
            <div className="flex gap-2 pt-1.5">
              {(["long", "short"] as const).map((tipo) => (
                <button
                  type="button"
                  key={tipo}
                  onClick={() => setField("tipoOperacion", tipo)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm capitalize ${
                    data.tipoOperacion === tipo
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-border bg-surface-muted text-foreground-muted"
                  }`}
                >
                  {tipo}
                </button>
              ))}
            </div>
          </label>
          )}

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Fecha de entrada</span>
            <input
              type="date"
              className={inputClasses}
              value={data.fechaEntrada}
              max={hoyISO()}
              onChange={(e) => setField("fechaEntrada", e.target.value)}
            />
          </label>

          {esFuturos && (
            <label className="flex flex-col gap-1">
              <span className={labelClasses}>Apalancamiento (x)</span>
              <input
                type="number"
                step="1"
                min={1}
                className={inputClasses}
                value={data.apalancamiento || ""}
                onChange={(e) =>
                  setField("apalancamiento", Number(e.target.value))
                }
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>
              Monto invertido{esFuturos ? " / margen" : ""} (USDT)
            </span>
            <input
              type="number"
              step="any"
              className={inputClasses}
              value={data.monto}
              onChange={(e) => setField("monto", e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Precio de entrada</span>
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

          <label className="col-span-2 flex flex-col gap-1">
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
              href={`/posiciones-abiertas?tab=${esFuturos ? "crypto-futuros" : "crypto-spot"}`}
              className="font-semibold underline"
            >
              Posiciones Abiertas
            </Link>
            .
          </p>
        )}
        {error && <p className="text-xs text-risk-red">{error}</p>}
        {fondosCuenta && <MensajeFondosInsuficientes cuenta={fondosCuenta} />}
      </form>

      <RiskPanel
        camposIncompletos={camposIncompletos}
        analizar={analizar}
        divisa="USDT"
        claseActivo={esFuturos ? "futuros" : "cripto_spot"}
      />
    </div>
  );
}
