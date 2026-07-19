"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputClasses, labelClasses } from "@/components/formStyles";
import SeccionAjustes from "./SeccionAjustes";

const supabase = createClient();

type Estado = { tipo: "ok" | "error"; texto: string } | null;

/** Mensaje de resultado (verde/rojo) reutilizable en los dos formularios. */
function Mensaje({ estado }: { estado: Estado }) {
  if (!estado) return null;
  return (
    <p
      className={`text-xs ${
        estado.tipo === "ok" ? "text-risk-green" : "text-risk-red"
      }`}
    >
      {estado.texto}
    </p>
  );
}

/**
 * Cambiar contraseña. Supabase no exige la contraseña vieja para `updateUser`,
 * así que la verificamos nosotros reautenticando con `signInWithPassword`
 * (mismo patrón que el borrado de cuenta): si la actual es incorrecta, cortamos
 * antes de actualizar. Pide actual + nueva + repetir la nueva.
 */
function CambiarPassword({ emailActual }: { emailActual: string }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<Estado>(null);

  const guardar = async () => {
    setEstado(null);
    if (!actual) {
      setEstado({ tipo: "error", texto: "Ingresá tu contraseña actual." });
      return;
    }
    if (nueva.length < 6) {
      setEstado({ tipo: "error", texto: "La nueva contraseña debe tener al menos 6 caracteres." });
      return;
    }
    if (nueva !== confirmar) {
      setEstado({ tipo: "error", texto: "Las contraseñas no coinciden." });
      return;
    }
    if (nueva === actual) {
      setEstado({ tipo: "error", texto: "La nueva contraseña debe ser distinta a la actual." });
      return;
    }
    setGuardando(true);

    // 1. Verificamos la contraseña actual reautenticando la sesión.
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: emailActual,
      password: actual,
    });
    if (authError) {
      setGuardando(false);
      setEstado({ tipo: "error", texto: "Contraseña actual incorrecta." });
      return;
    }

    // 2. Actualizamos a la nueva.
    const { error } = await supabase.auth.updateUser({ password: nueva });
    setGuardando(false);
    if (error) {
      setEstado({ tipo: "error", texto: error.message });
      return;
    }
    setActual("");
    setNueva("");
    setConfirmar("");
    setEstado({ tipo: "ok", texto: "Contraseña actualizada." });
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <p className="text-xs font-medium text-foreground">Cambiar contraseña</p>
      <label className="flex flex-col gap-1">
        <span className={labelClasses}>Contraseña actual</span>
        <input
          type="password"
          className={inputClasses}
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClasses}>Nueva contraseña</span>
          <input
            type="password"
            className={inputClasses}
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClasses}>Repetir nueva contraseña</span>
          <input
            type="password"
            className={inputClasses}
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            autoComplete="new-password"
          />
        </label>
      </div>
      <Mensaje estado={estado} />
      <button
        type="button"
        onClick={guardar}
        disabled={guardando || !actual || !nueva || !confirmar}
        className="self-start rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
      >
        {guardando ? "Guardando..." : "Actualizar contraseña"}
      </button>
    </div>
  );
}

// El formulario de "Cambiar email" se quitó a propósito: cambiar el email de
// acceso depende de tener la confirmación por mail configurada en Supabase, que
// todavía no está. Se repondrá cuando habilitemos verificación/recuperación por
// correo (ver el historial de sesiones del proyecto).

export default function SeccionCuenta() {
  const [emailActual, setEmailActual] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmailActual(data.user?.email ?? "");
    });
  }, []);

  return (
    <SeccionAjustes
      titulo="Cuenta de usuario"
      descripcion="Tus datos de acceso. El cierre de sesión está en la barra de arriba."
    >
      <div className="flex flex-col gap-1">
        <span className={labelClasses}>Email actual</span>
        <p className="text-sm text-foreground">{emailActual || "…"}</p>
      </div>
      <CambiarPassword emailActual={emailActual} />
    </SeccionAjustes>
  );
}
