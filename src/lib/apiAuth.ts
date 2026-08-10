import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Guarda de sesión para los route handlers. Devuelve una respuesta 401 si no
 * hay usuario, o `null` si puede seguir:
 *
 *   const noAutorizado = await exigirSesion();
 *   if (noAutorizado) return noAutorizado;
 *
 * Qué agrega si ya está el middleware: el matcher de `src/proxy.ts` cubre
 * `/api/*` y ya frenaba a quien no tiene sesión, así que estas rutas NO estaban
 * abiertas. Lo que hacía era responder un 307 a /login, es decir HTML de una
 * pantalla de login como respuesta a una llamada JSON: el cliente no puede
 * distinguir "no autenticado" de "no hay resultados". Acá se responde 401, que
 * es lo que el llamador puede interpretar.
 *
 * El otro motivo es defensa en profundidad: la protección de las rutas de
 * mercado —las únicas que salen a internet, y por lo tanto las que gastan cuota
 * si se abusan— hoy depende por completo de un regex en el matcher y de la
 * lista PUBLIC_PATHS. Con esta guarda, tocar cualquiera de los dos deja de ser
 * suficiente para exponerlas.
 *
 * Usa `getUser()`, no `getSession()`: revalida el token contra Supabase Auth
 * en vez de confiar en la cookie (mismo criterio que el middleware).
 */
export async function exigirSesion(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return null;
}
