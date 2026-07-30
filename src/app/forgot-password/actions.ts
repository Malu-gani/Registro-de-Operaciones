"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function pedirRecuperacion(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Si falla (email inexistente, rate limit) NO se distingue del éxito: la
  // respuesta al usuario es siempre la misma, para no revelar qué emails existen.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/reset-password`,
  });

  redirect(
    `/forgot-password?message=${encodeURIComponent(
      "Si el email está registrado, te mandamos un enlace para recuperar la contraseña."
    )}`
  );
}
