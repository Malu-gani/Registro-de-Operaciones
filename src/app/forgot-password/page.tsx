import Link from "next/link";
import { pedirRecuperacion } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
        <h1 className="mb-1 text-lg font-semibold text-foreground">
          Recuperar contraseña
        </h1>
        <p className="mb-6 text-sm text-foreground-muted">
          Ingresá tu email y te mandamos un enlace para elegir una nueva.
        </p>

        {params.message && (
          <p className="mb-4 rounded-lg border border-risk-green-border bg-risk-green-bg p-3 text-sm text-risk-green">
            {params.message}
          </p>
        )}
        {params.error && (
          <p className="mb-4 rounded-lg border border-risk-red-border bg-risk-red-bg p-3 text-sm text-risk-red">
            {params.error}
          </p>
        )}

        <form action={pedirRecuperacion} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground-muted">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            Enviar enlace
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-foreground-muted">
          <Link href="/login" className="text-brand underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
