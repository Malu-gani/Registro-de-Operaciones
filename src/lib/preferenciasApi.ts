import { createClient } from "./supabase/client";
import type { UmbralesRiesgo } from "@/utils/riskCalculations";

const supabase = createClient();

/** Tema de la interfaz. `auto` sigue el tema del sistema operativo. */
export type Tema = "auto" | "claro" | "oscuro";

/**
 * Preferencias del usuario (pestaña Ajustes). `umbralesRiesgo` es `null` cuando
 * el usuario no personalizó el semáforo: en ese caso la app usa
 * `UMBRALES_RIESGO_DEFAULT`.
 */
export interface Preferencias {
  tema: Tema;
  umbralesRiesgo: UmbralesRiesgo | null;
}

/** Valores en memoria cuando el usuario todavía no guardó ninguna preferencia. */
export const PREFERENCIAS_DEFAULT: Preferencias = {
  tema: "auto",
  umbralesRiesgo: null,
};

interface PreferenciasRow {
  user_id: string;
  tema: Tema;
  umbrales_riesgo: UmbralesRiesgo | null;
  updated_at: string;
}

function rowToPreferencias(row: PreferenciasRow): Preferencias {
  return {
    tema: row.tema,
    umbralesRiesgo: row.umbrales_riesgo,
  };
}

/**
 * Trae las preferencias del usuario actual. Si todavía no tiene fila (nunca
 * guardó nada), devuelve los valores por defecto en vez de error.
 */
export async function fetchPreferencias(): Promise<Preferencias> {
  const { data, error } = await supabase
    .from("preferencias_usuario")
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return PREFERENCIAS_DEFAULT;

  return rowToPreferencias(data as PreferenciasRow);
}

/**
 * Guarda (upsert) las preferencias del usuario actual. El `user_id` se toma de
 * la sesión y se manda explícito (el upsert desde el cliente necesita la PK); la
 * RLS igual exige que coincida con `auth.uid()`, así que no se puede falsear.
 */
export async function upsertPreferencias(prefs: Preferencias): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) throw new Error("No hay una sesión activa.");

  const { error } = await supabase.from("preferencias_usuario").upsert(
    {
      user_id: user.id,
      tema: prefs.tema,
      umbrales_riesgo: prefs.umbralesRiesgo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(error.message);
}
