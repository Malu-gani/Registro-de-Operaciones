import type { Tema } from "./preferenciasApi";

/**
 * Aplicación del tema en el DOM. La fuente de verdad de la preferencia es la
 * cuenta (tabla `preferencias_usuario`), pero se espeja en localStorage para
 * que el script inline del <head> pueda aplicar el tema antes de pintar y no
 * haya parpadeo al entrar. El CSS solo distingue `data-theme="oscuro"`; la
 * ausencia del atributo (o "claro") es el tema claro.
 */

export const TEMA_STORAGE_KEY = "tema-diario";

/** Resuelve la preferencia al tema concreto, mapeando `auto` al del sistema. */
export function resolverTema(tema: Tema): "claro" | "oscuro" {
  if (tema === "auto") {
    const prefiereOscuro =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefiereOscuro ? "oscuro" : "claro";
  }
  return tema;
}

/**
 * Aplica el tema al `<html>` (data-theme resuelto) y espeja la preferencia en
 * localStorage para el próximo arranque. No-op fuera del navegador (SSR).
 */
export function aplicarTema(tema: Tema): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolverTema(tema));
  try {
    localStorage.setItem(TEMA_STORAGE_KEY, tema);
  } catch {
    // localStorage puede fallar (modo privado, permisos); el tema igual se
    // aplicó en memoria, solo se pierde el espejo anti-parpadeo.
  }
}

/**
 * Script que corre inline en el <head>, antes de pintar, para fijar el tema
 * cacheado y evitar el flash. Se serializa como string (no puede importar
 * módulos). La clave debe coincidir con TEMA_STORAGE_KEY.
 */
export const SCRIPT_TEMA_INICIAL = `(function(){try{
var t=localStorage.getItem('${TEMA_STORAGE_KEY}')||'auto';
var oscuro=t==='oscuro'||(t==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.setAttribute('data-theme',oscuro?'oscuro':'claro');
}catch(e){}})();`;
