import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REQUISITOS_PASSWORD_HINT } from "@/utils/passwordPolicy";
import { establecerPassword } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  // El callback dejó una sesión de recuperación. Sin ella no se puede fijar la
  // contraseña: mandamos a pedir un enlace nuevo.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(
        "El enlace venció o no es válido. Pedí uno nuevo."
      )}`
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
        <h1 className="mb-1 text-lg font-semibold text-foreground">
          Elegí una nueva contraseña
        </h1>
        <p className="mb-6 text-sm text-foreground-muted">
          Escribí tu contraseña nueva dos veces.
        </p>

        {params.error && (
          <p className="mb-4 rounded-lg border border-risk-red-border bg-risk-red-bg p-3 text-sm text-risk-red">
            {params.error}
          </p>
        )}

        <form action={establecerPassword} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground-muted">
              Contraseña nueva
            </span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            />
            <span className="text-xs text-foreground-muted">
              {REQUISITOS_PASSWORD_HINT}
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground-muted">
              Repetir contraseña
            </span>
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            Guardar contraseña
          </button>
        </form>
      </div>
    </div>
  );
}
