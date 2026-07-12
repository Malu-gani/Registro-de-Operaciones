import Link from "next/link";
import { signup } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
        <h1 className="mb-1 text-lg font-semibold text-foreground">
          Crear cuenta
        </h1>
        <p className="mb-6 text-sm text-foreground-muted">
          Registrate para empezar tu diario de trading.
        </p>

        {params.error && (
          <p className="mb-4 rounded-lg border border-risk-red-border bg-risk-red-bg p-3 text-sm text-risk-red">
            {params.error}
          </p>
        )}

        <form action={signup} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground-muted">
              Email
            </span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground-muted">
              Contraseña
            </span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}"
              title="Mínimo 8 caracteres, con al menos una mayúscula, una minúscula, un número y un carácter especial."
              autoComplete="new-password"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            />
            <span className="text-xs text-foreground-muted">
              Mínimo 8 caracteres, con mayúscula, minúscula, número y
              carácter especial.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground-muted">
              Confirmar contraseña
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
            Crear cuenta
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-foreground-muted">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="text-brand underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
