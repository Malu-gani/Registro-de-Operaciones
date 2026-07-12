"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  const passwordErrors: string[] = [];
  if (password.length < 8) passwordErrors.push("al menos 8 caracteres");
  if (!/[a-z]/.test(password)) passwordErrors.push("una minúscula");
  if (!/[A-Z]/.test(password)) passwordErrors.push("una mayúscula");
  if (!/[0-9]/.test(password)) passwordErrors.push("un número");
  if (!/[^A-Za-z0-9]/.test(password)) passwordErrors.push("un carácter especial");

  if (passwordErrors.length > 0) {
    redirect(
      `/signup?error=${encodeURIComponent(
        `La contraseña debe tener ${passwordErrors.join(", ")}.`
      )}`
    );
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
      emailRedirectTo: `${siteUrl}/auth/callback`,
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
