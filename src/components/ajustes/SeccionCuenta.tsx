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

/** Cambiar contraseña. En una sesión activa Supabase no exige la contraseña vieja. */
function CambiarPassword() {
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<Estado>(null);

  const guardar = async () => {
    setEstado(null);
    if (nueva.length < 6) {
      setEstado({ tipo: "error", texto: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }
    if (nueva !== confirmar) {
      setEstado({ tipo: "error", texto: "Las contraseñas no coinciden." });
      return;
    }
    setGuardando(true);
    const { error } = await supabase.auth.updateUser({ password: nueva });
    setGuardando(false);
    if (error) {
      setEstado({ tipo: "error", texto: error.message });
      return;
    }
    setNueva("");
    setConfirmar("");
    setEstado({ tipo: "ok", texto: "Contraseña actualizada." });
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <p className="text-xs font-medium text-foreground">Cambiar contraseña</p>
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
          <span className={labelClasses}>Repetir contraseña</span>
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
        disabled={guardando || !nueva || !confirmar}
        className="self-start rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
      >
        {guardando ? "Guardando..." : "Actualizar contraseña"}
      </button>
    </div>
  );
}

/** Cambiar email. Dispara la confirmación por mail que tenga configurada Supabase. */
function CambiarEmail({ emailActual }: { emailActual: string }) {
  const [email, setEmail] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<Estado>(null);

  const guardar = async () => {
    setEstado(null);
    const limpio = email.trim();
    if (!limpio || !limpio.includes("@")) {
      setEstado({ tipo: "error", texto: "Ingresá un email válido." });
      return;
    }
    if (limpio === emailActual) {
      setEstado({ tipo: "error", texto: "Ese ya es tu email actual." });
      return;
    }
    setGuardando(true);
    const { error } = await supabase.auth.updateUser({ email: limpio });
    setGuardando(false);
    if (error) {
      setEstado({ tipo: "error", texto: error.message });
      return;
    }
    setEmail("");
    setEstado({
      tipo: "ok",
      texto:
        "Pedido de cambio enviado. Si tenés confirmación por email activada, revisá tu casilla para confirmarlo.",
    });
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <p className="text-xs font-medium text-foreground">Cambiar email</p>
      <label className="flex flex-col gap-1">
        <span className={labelClasses}>Nuevo email</span>
        <input
          type="email"
          className={inputClasses}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={emailActual}
          autoComplete="email"
        />
      </label>
      <Mensaje estado={estado} />
      <button
        type="button"
        onClick={guardar}
        disabled={guardando || !email}
        className="self-start rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
      >
        {guardando ? "Guardando..." : "Cambiar email"}
      </button>
    </div>
  );
}

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
      <CambiarPassword />
      <CambiarEmail emailActual={emailActual} />
    </SeccionAjustes>
  );
}
