import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  // Base del redirect desde NEXT_PUBLIC_SITE_URL (ver el mismo comentario que en
  // auth/callback: next start puede reportar mal el host).
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  if (tokenHash && type) {
    // verifyOtp con token_hash NO necesita un cookie previo del navegador (a
    // diferencia del intercambio PKCE), así que el link del mail funciona desde
    // cualquier dispositivo. Las cookies de sesión que setea se escriben sobre
    // esta respuesta de redirect (mismo patrón que el middleware).
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

    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(
    `${base}/login?error=${encodeURIComponent(
      "El enlace no es válido o ya venció. Probá iniciar sesión o pedí uno nuevo."
    )}`
  );
}
