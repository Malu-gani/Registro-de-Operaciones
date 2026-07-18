"use client";

import { useSyncExternalStore } from "react";
import { usePreferencias } from "@/context/PreferenciasContext";

/**
 * Botón sol/luna del header para alternar el tema desde cualquier pantalla.
 * Refleja el tema *resuelto* actual leyendo el atributo `data-theme` del <html>
 * (que `PreferenciasContext` mantiene sincronizado, incluso cuando la
 * preferencia es 'auto' y cambia el sistema). Al clickear fija el opuesto
 * explícito ('claro'/'oscuro'), que se persiste en la cuenta vía `setTema`.
 * 'auto' sigue siendo válido; solo deja de ofrecerse desde la UI.
 */

/** Suscribe a cambios del atributo data-theme del <html>. */
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

export default function ToggleTema() {
  const { setTema, loading } = usePreferencias();
  // getServerSnapshot devuelve false (claro) para que el primer render coincida
  // en SSR; tras montar, useSyncExternalStore lee el DOM real sin mismatch.
  const esOscuro = useSyncExternalStore(suscribir, esOscuroAhora, () => false);

  const alternar = () => {
    setTema(esOscuro ? "claro" : "oscuro").catch(() => {
      // Si falla la persistencia, el context ya revierte el cambio optimista.
    });
  };

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={loading}
      aria-label={esOscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={esOscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground-muted hover:bg-surface-muted disabled:opacity-60"
    >
      {esOscuro ? (
        // Sol: en tema oscuro el botón ofrece pasar a claro.
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        // Luna: en tema claro el botón ofrece pasar a oscuro.
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
