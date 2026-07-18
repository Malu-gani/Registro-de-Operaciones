"use client";

import { useState } from "react";
import { usePreferencias } from "@/context/PreferenciasContext";
import {
  type ClaseActivo,
  type CortesRiesgo,
  type UmbralesRiesgo,
} from "@/utils/riskCalculations";
import { inputClasses, labelClasses } from "@/components/formStyles";
import SeccionAjustes from "./SeccionAjustes";

type Nivel = keyof CortesRiesgo; // "bajo" | "medio" | "alto"
type Borrador = Record<ClaseActivo, Record<Nivel, string>>;

const CLASES: { id: ClaseActivo; label: string; ayuda: string }[] = [
  {
    id: "acciones",
    label: "Acciones / CEDEARs",
    ayuda: "% de riesgo sobre el capital invertido.",
  },
  {
    id: "cripto_spot",
    label: "Cripto Spot",
    ayuda: "% de riesgo sobre el capital invertido.",
  },
  {
    id: "futuros",
    label: "Cripto Futuros",
    ayuda: "% de riesgo sobre el valor nocional (apalancado).",
  },
];

const NIVELES: Nivel[] = ["bajo", "medio", "alto"];

function aBorrador(umbrales: UmbralesRiesgo): Borrador {
  return {
    acciones: mapClase(umbrales.acciones),
    cripto_spot: mapClase(umbrales.cripto_spot),
    futuros: mapClase(umbrales.futuros),
  };
}

function mapClase(c: CortesRiesgo): Record<Nivel, string> {
  return { bajo: String(c.bajo), medio: String(c.medio), alto: String(c.alto) };
}

/**
 * Valida y convierte el borrador a `UmbralesRiesgo`. Cada clase exige cortes
 * estrictamente crecientes (bajo < medio < alto) dentro de (0, 100]. Devuelve
 * el error de la primera clase que falla, o los umbrales listos para guardar.
 */
function validar(
  borrador: Borrador
): { ok: true; umbrales: UmbralesRiesgo } | { ok: false; error: string } {
  const salida = {} as UmbralesRiesgo;
  for (const clase of CLASES) {
    const b = borrador[clase.id];
    const bajo = Number(b.bajo);
    const medio = Number(b.medio);
    const alto = Number(b.alto);
    for (const [nombre, valor] of [
      ["Bajo", bajo],
      ["Medio", medio],
      ["Alto", alto],
    ] as const) {
      if (!Number.isFinite(valor) || valor <= 0 || valor > 100) {
        return {
          ok: false,
          error: `${clase.label}: "${nombre}" debe ser un número entre 0 y 100.`,
        };
      }
    }
    if (!(bajo < medio && medio < alto)) {
      return {
        ok: false,
        error: `${clase.label}: los cortes deben ir de menor a mayor (Bajo < Medio < Alto).`,
      };
    }
    salida[clase.id] = { bajo, medio, alto };
  }
  return { ok: true, umbrales: salida };
}

export default function SeccionUmbrales() {
  const { umbrales, umbralesPersonalizados, guardarUmbrales, restaurarUmbrales, loading } =
    usePreferencias();

  const [borrador, setBorrador] = useState<Borrador>(() => aBorrador(umbrales));
  // Resincroniza el borrador cuando cambian los umbrales del context (carga
  // inicial desde la base, guardado, restaurado), sin pisar lo que el usuario
  // esté tipeando (esos cambios no tocan `umbrales`). Patrón de reset por firma.
  const [firma, setFirma] = useState(() => JSON.stringify(umbrales));
  const firmaActual = JSON.stringify(umbrales);
  if (firmaActual !== firma) {
    setFirma(firmaActual);
    setBorrador(aBorrador(umbrales));
  }

  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const setCampo = (clase: ClaseActivo, nivel: Nivel, valor: string) => {
    setBorrador((prev) => ({ ...prev, [clase]: { ...prev[clase], [nivel]: valor } }));
    setEstado(null);
  };

  const guardar = async () => {
    const res = validar(borrador);
    if (!res.ok) {
      setEstado({ tipo: "error", texto: res.error });
      return;
    }
    setGuardando(true);
    try {
      await guardarUmbrales(res.umbrales);
      setEstado({ tipo: "ok", texto: "Umbrales guardados." });
    } catch {
      setEstado({ tipo: "error", texto: "No se pudieron guardar los umbrales. Reintentá." });
    } finally {
      setGuardando(false);
    }
  };

  const restaurar = async () => {
    setEstado(null);
    setGuardando(true);
    try {
      await restaurarUmbrales();
      setEstado({ tipo: "ok", texto: "Se restauraron los valores por defecto." });
    } catch {
      setEstado({ tipo: "error", texto: "No se pudo restaurar. Reintentá." });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <SeccionAjustes
      titulo="Semáforo de riesgo"
      descripcion="Definí hasta qué % de riesgo cada operación se considera Bajo, Medio o Alto por tipo de activo. Todo lo que supere el corte Alto se marca Crítico."
    >
      <div className="flex flex-col gap-4">
        {CLASES.map((clase) => (
          <div key={clase.id} className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-foreground">{clase.label}</p>
            <p className="mb-3 text-xs text-foreground-muted">{clase.ayuda}</p>
            <div className="grid grid-cols-3 gap-3">
              {NIVELES.map((nivel) => (
                <label key={nivel} className="flex flex-col gap-1">
                  <span className={`${labelClasses} capitalize`}>{nivel} hasta %</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max="100"
                    className={inputClasses}
                    value={borrador[clase.id][nivel]}
                    onChange={(e) => setCampo(clase.id, nivel, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {estado && (
        <p className={`text-xs ${estado.tipo === "ok" ? "text-risk-green" : "text-risk-red"}`}>
          {estado.texto}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || loading}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
        >
          {guardando ? "Guardando..." : "Guardar umbrales"}
        </button>
        {umbralesPersonalizados && (
          <button
            type="button"
            onClick={restaurar}
            disabled={guardando || loading}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted disabled:opacity-60"
          >
            Restaurar valores por defecto
          </button>
        )}
      </div>
    </SeccionAjustes>
  );
}
