"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/PasswordInput";
import { inputClasses, labelClasses } from "@/components/formStyles";
import SeccionAjustes from "./SeccionAjustes";

const supabase = createClient();

/**
 * Zona peligrosa: borrado definitivo de la cuenta. Todo cuelga en cascada de
 * auth.users, así que el borrado real lo hace la función SQL
 * `delete_own_account()` (migración 013). Antes de llamarla:
 *   1. avisamos que es irreversible y ofrecemos exportar el historial primero,
 *   2. pedimos re-ingresar la contraseña (la validamos con signInWithPassword),
 *   3. exigimos una segunda confirmación explícita.
 * Al terminar cerramos sesión y mandamos al login con un mensaje.
 */
export default function SeccionBorrarCuenta() {
  const [email, setEmail] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
    });
  }, []);

  const cerrarModal = () => {
    if (borrando) return;
    setModalAbierto(false);
    setPassword("");
    setConfirmado(false);
    setError(null);
  };

  const borrar = async () => {
    setError(null);
    if (!password) {
      setError("Ingresá tu contraseña para confirmar.");
      return;
    }
    if (!confirmado) {
      setError("Marcá la casilla de confirmación.");
      return;
    }
    setBorrando(true);

    // 1. Validamos la contraseña reautenticando con la sesión actual.
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authError) {
      setBorrando(false);
      setError("La contraseña es incorrecta.");
      return;
    }

    // 2. Borrado real (usuario + todos sus datos en cascada).
    const { error: rpcError } = await supabase.rpc("delete_own_account");
    if (rpcError) {
      setBorrando(false);
      setError(
        "No se pudo eliminar la cuenta. Intentá de nuevo o avisá si el problema persiste."
      );
      return;
    }

    // 3. Cerramos sesión y volvemos al login con un mensaje.
    await supabase.auth.signOut();
    window.location.href =
      "/login?message=" + encodeURIComponent("Tu cuenta fue eliminada.");
  };

  return (
    <SeccionAjustes
      titulo="Eliminar cuenta"
      descripcion="Borra tu cuenta y todos tus datos (portafolios, operaciones, saldos y movimientos) de forma permanente. Esta acción no se puede deshacer."
      tono="peligro"
    >
      <p className="text-xs text-foreground-muted">
        Antes de continuar, podés{" "}
        <Link href="/historial?tab=importar" className="text-brand underline">
          descargar tu historial
        </Link>{" "}
        para guardar una copia.
      </p>

      <button
        type="button"
        onClick={() => setModalAbierto(true)}
        className="self-start rounded-md border border-risk-red-border px-4 py-2 text-sm font-semibold text-risk-red hover:bg-risk-red/10"
      >
        Eliminar mi cuenta
      </button>

      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
            <h3 className="text-sm font-semibold text-risk-red">
              Confirmar eliminación de cuenta
            </h3>
            <p className="mt-2 text-xs text-foreground-muted">
              Vas a eliminar la cuenta <span className="text-foreground">{email}</span>{" "}
              y todos sus datos. Esto es permanente e irreversible.
            </p>

            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className={labelClasses}>Ingresá tu contraseña</span>
                <PasswordInput
                  className={inputClasses}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>

              <label className="flex items-start gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmado}
                  onChange={(e) => setConfirmado(e.target.checked)}
                />
                <span>
                  Entiendo que esta acción es permanente y que se borrarán todos
                  mis datos.
                </span>
              </label>

              {error && <p className="text-xs text-risk-red">{error}</p>}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={cerrarModal}
                disabled={borrando}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={borrar}
                disabled={borrando || !password || !confirmado}
                className="rounded-md bg-risk-red px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {borrando ? "Eliminando..." : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SeccionAjustes>
  );
}
