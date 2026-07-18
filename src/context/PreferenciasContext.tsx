"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  fetchPreferencias,
  upsertPreferencias,
  PREFERENCIAS_DEFAULT,
  type Preferencias,
  type Tema,
} from "@/lib/preferenciasApi";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { aplicarTema } from "@/lib/tema";
import {
  UMBRALES_RIESGO_DEFAULT,
  type UmbralesRiesgo,
} from "@/utils/riskCalculations";

interface PreferenciasContextValue {
  /** Tema elegido (`auto` sigue al sistema operativo). */
  tema: Tema;
  /** Umbrales del semáforo ya resueltos (nunca null): personalizados o default. */
  umbrales: UmbralesRiesgo;
  /** `true` si el usuario personalizó los umbrales (para mostrar "Restaurar"). */
  umbralesPersonalizados: boolean;
  loading: boolean;
  error: string | null;
  /** Cambia el tema y lo persiste (optimista; revierte si falla). */
  setTema: (tema: Tema) => Promise<void>;
  /** Guarda umbrales personalizados y los persiste (optimista). */
  guardarUmbrales: (umbrales: UmbralesRiesgo) => Promise<void>;
  /** Vuelve a los umbrales por defecto (borra la personalización). */
  restaurarUmbrales: () => Promise<void>;
}

const PreferenciasContext = createContext<PreferenciasContextValue | null>(null);

export function PreferenciasProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferencias>(PREFERENCIAS_DEFAULT);
  // Si Supabase no está configurado nunca se carga nada: arranca en false para no
  // tener que llamar setState dentro del efecto (evita cascading renders).
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelado = false;
    fetchPreferencias()
      .then((p) => {
        if (!cancelado) setPrefs(p);
      })
      .catch((e) => {
        // Un fallo al leer preferencias no debe romper la app: se sigue con los
        // valores por defecto y se deja el error visible en Ajustes.
        if (!cancelado) {
          setError(e instanceof Error ? e.message : "Error al cargar preferencias");
        }
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Aplica el tema al DOM cada vez que cambia la preferencia y, si está en
  // 'auto', re-aplica cuando el sistema operativo cambia de claro a oscuro.
  useEffect(() => {
    aplicarTema(prefs.tema);
    if (prefs.tema !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onCambio = () => aplicarTema("auto");
    mq.addEventListener("change", onCambio);
    return () => mq.removeEventListener("change", onCambio);
  }, [prefs.tema]);

  /** Persiste un cambio parcial de forma optimista, revirtiendo si falla. */
  const persistir = async (siguiente: Preferencias) => {
    const anterior = prefs;
    setPrefs(siguiente);
    setError(null);
    try {
      await upsertPreferencias(siguiente);
    } catch (e) {
      setPrefs(anterior);
      setError(e instanceof Error ? e.message : "No se pudieron guardar las preferencias");
      throw e;
    }
  };

  const setTema = (tema: Tema) => persistir({ ...prefs, tema });
  const guardarUmbrales = (umbrales: UmbralesRiesgo) =>
    persistir({ ...prefs, umbralesRiesgo: umbrales });
  const restaurarUmbrales = () => persistir({ ...prefs, umbralesRiesgo: null });

  return (
    <PreferenciasContext.Provider
      value={{
        tema: prefs.tema,
        umbrales: prefs.umbralesRiesgo ?? UMBRALES_RIESGO_DEFAULT,
        umbralesPersonalizados: prefs.umbralesRiesgo !== null,
        loading,
        error,
        setTema,
        guardarUmbrales,
        restaurarUmbrales,
      }}
    >
      {children}
    </PreferenciasContext.Provider>
  );
}

export function usePreferencias() {
  const ctx = useContext(PreferenciasContext);
  if (!ctx) {
    throw new Error("usePreferencias debe usarse dentro de PreferenciasProvider");
  }
  return ctx;
}
