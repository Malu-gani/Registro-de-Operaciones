"use client";

import { useSyncExternalStore } from "react";
import { usePreferencias } from "@/context/PreferenciasContext";
import { IconoSol, IconoLuna } from "@/components/navIcons";

/**
 * Toggle de tema de dos píldoras (Claro | Oscuro) para el pie del Sidebar.
 * Misma lógica que el botón sol/luna del header (`ToggleTema`): lee el tema
 * resuelto del atributo `data-theme` del <html> y al elegir un lado fija ese
 * tema explícito, persistido en la cuenta. Ambas píldoras están siempre en el
 * DOM y solo cambian de clase (seguro con la traducción del navegador).
 */

function suscribir(onCambio: () => void): () => void {
  const observer = new MutationObserver(onCambio);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function esOscuroAhora(): boolean {
  return document.documentElement.getAttribute("data-theme") === "oscuro";
}

export default function SidebarTemaToggle() {
  const { setTema, loading } = usePreferencias();
  const esOscuro = useSyncExternalStore(suscribir, esOscuroAhora, () => false);

  const elegir = (oscuro: boolean) => {
    if (oscuro === esOscuro) return;
    setTema(oscuro ? "oscuro" : "claro").catch(() => {
      // Si falla la persistencia, el context revierte el cambio optimista.
    });
  };

  const pill =
    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-60";

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-surface-muted p-1">
      <button
        type="button"
        onClick={() => elegir(false)}
        disabled={loading}
        aria-pressed={!esOscuro}
        className={`${pill} ${
          esOscuro
            ? "text-foreground-muted hover:text-foreground"
            : "nav-activo"
        }`}
      >
        <IconoSol className="h-4 w-4" />
        Claro
      </button>
      <button
        type="button"
        onClick={() => elegir(true)}
        disabled={loading}
        aria-pressed={esOscuro}
        className={`${pill} ${
          esOscuro
            ? "nav-activo"
            : "text-foreground-muted hover:text-foreground"
        }`}
      >
        <IconoLuna className="h-4 w-4" />
        Oscuro
      </button>
    </div>
  );
}
