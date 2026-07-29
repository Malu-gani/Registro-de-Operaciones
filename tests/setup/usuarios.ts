import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { entornoSupabase } from "./entornoSupabase";

export interface UsuarioDePrueba {
  userId: string;
  email: string;
  /** Portafolio creado automáticamente por el trigger handle_new_user. */
  portafolioId: string;
  /** Autenticado como el usuario: respeta RLS. Es el que se usa en los tests. */
  client: SupabaseClient;
  /** service_role: saltea RLS. Solo para preparar y aseverar estado. */
  admin: SupabaseClient;
}

const PASSWORD = "Prueba1234!";

/**
 * Crea un usuario nuevo con email único y devuelve un cliente autenticado.
 * Cada test usa el suyo: el aislamiento lo da RLS, no un truncate entre tests,
 * así que los tests pueden correr en paralelo sin pisarse.
 */
export async function crearUsuarioDePrueba(): Promise<UsuarioDePrueba> {
  const { url, anonKey, serviceRoleKey } = entornoSupabase();

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `test-${randomUUID()}@ejemplo.test`;
  const { data: creado, error: errorAlta } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (errorAlta || !creado.user) {
    throw new Error(`No se pudo crear el usuario de prueba: ${errorAlta?.message}`);
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: errorLogin } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (errorLogin) {
    throw new Error(`No se pudo iniciar sesión: ${errorLogin.message}`);
  }

  // El trigger handle_new_user ya creó "Mi Cuenta Principal" (tipo mixto).
  const { data: portafolios, error: errorPortafolio } = await client
    .from("portafolios")
    .select("id")
    .limit(1);
  if (errorPortafolio || !portafolios?.length) {
    throw new Error(
      `El trigger handle_new_user no creó el portafolio por defecto: ${errorPortafolio?.message}`
    );
  }

  return {
    userId: creado.user.id,
    email,
    portafolioId: portafolios[0].id as string,
    client,
    admin,
  };
}

/** Lee el disponible de una cuenta. Devuelve 0 si la fila no existe todavía. */
export async function disponibleDe(
  u: UsuarioDePrueba,
  cuenta: string
): Promise<number> {
  const { data } = await u.client
    .from("cuentas_saldos")
    .select("disponible")
    .eq("portafolio_id", u.portafolioId)
    .eq("cuenta", cuenta)
    .maybeSingle();
  return data ? Number(data.disponible) : 0;
}
