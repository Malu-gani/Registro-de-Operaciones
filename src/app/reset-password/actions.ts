"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validarPassword } from "@/utils/passwordPolicy";

export async function establecerPassword(formData: FormData) {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  const errorPolitica = validarPassword(password);
  if (errorPolitica) {
    redirect(`/reset-password?error=${encodeURIComponent(errorPolitica)}`);
  }
  if (password !== confirmPassword) {
    redirect(
      `/reset-password?error=${encodeURIComponent("Las contraseñas no coinciden.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(
      `/reset-password?error=${encodeURIComponent(
        "No se pudo actualizar la contraseña. Pedí un enlace nuevo."
      )}`
    );
  }

  redirect("/dashboard");
}
