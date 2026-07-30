"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esEmailSinConfirmar, traducirErrorAuth } from "@/utils/authErrors";

export async function login(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const params = new URLSearchParams({ error: traducirErrorAuth(error.message) });
    // Flag para que la página ofrezca el reenvío. El email NO va en la URL:
    // lo vuelve a tipear el usuario en el formulario de reenvío.
    if (esEmailSinConfirmar(error.message)) params.set("sinConfirmar", "1");
    redirect(`/login?${params.toString()}`);
  }

  redirect("/dashboard");
}

export async function reenviarConfirmacion(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/confirm?next=/dashboard` },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(traducirErrorAuth(error.message))}`);
  }

  redirect(
    `/login?message=${encodeURIComponent(
      "Te reenviamos el correo de confirmación. Revisá tu casilla."
    )}`
  );
}
