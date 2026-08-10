import Link from "next/link";
import PasswordInput from "@/components/PasswordInput";
import { login, reenviarConfirmacion } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; sinConfirmar?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
        <h1 className="mb-1 text-lg font-semibold text-foreground">
          Iniciar sesión
        </h1>
        <p className="mb-6 text-sm text-foreground-muted">
          Acceda a su diario de trading.
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

        {params.sinConfirmar && (
          <form action={reenviarConfirmacion} className="mb-4 flex flex-col gap-2">
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="Reingresá tu email"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            />
            <button
              type="submit"
              className="rounded-md border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand hover:text-brand-foreground"
            >
              Reenviar email de confirmación
            </button>
          </form>
        )}

        <form action={login} className="flex flex-col gap-4">
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
            <PasswordInput
              name="password"
              required
              minLength={8}
              autoComplete="current-password"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            />
          </label>

          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            Ingresar
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-brand underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>

        <p className="mt-4 text-center text-sm text-foreground-muted">
          ¿No tiene una cuenta?{" "}
          <Link href="/signup" className="text-brand underline">
            Regístrese
          </Link>
        </p>
      </div>
    </div>
  );
}
