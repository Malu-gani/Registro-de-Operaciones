import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { rutaInternaSegura } from "@/utils/rutaSegura";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  // Validado: `next` llega de la query y se concatena a la base del sitio.
  const next = rutaInternaSegura(searchParams.get("next"));

  // Base para el redirect: NEXT_PUBLIC_SITE_URL, no el origin de request.url.
  // `next start` puede reportar el host como "localhost" aunque el navegador
  // esté en "127.0.0.1" (o, en producción detrás de un proxy, en el dominio
  // real). Como el link del mail se arma con SITE_URL, el navegador llega al
  // callback en ESE host y ahí quedan las cookies; redirigir a otro host las
  // dejaría afuera y la sesión se perdería (el usuario terminaba en /login).
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  if (code) {
    // Las cookies de sesión que setea el intercambio tienen que viajar EN ESTA
    // respuesta (mismo patrón que src/lib/supabase/middleware.ts): con el cliente
    // basado en next/headers, un NextResponse.redirect a mano no las arrastra.
    const response = NextResponse.redirect(`${base}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(
    `${base}/login?error=${encodeURIComponent(
      "No se pudo confirmar el email. Probá iniciar sesión o registrate de nuevo."
    )}`
  );
}
