"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validarPassword } from "@/utils/passwordPolicy";

export async function signup(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  const passwordError = validarPassword(password);
  if (passwordError) {
    redirect(`/signup?error=${encodeURIComponent(passwordError)}`);
  }

  if (password !== confirmPassword) {
    redirect(
      `/signup?error=${encodeURIComponent("Las contraseñas no coinciden.")}`
    );
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm?next=/dashboard`,
    },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/login?message=${encodeURIComponent(
      "Revisá tu email para confirmar la cuenta antes de iniciar sesión."
    )}`
  );
}
