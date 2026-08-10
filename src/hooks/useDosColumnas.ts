"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ¿Hay lugar real para 2 columnas?
 *
 * Se decide con el MENOR entre el ancho del contenedor y el de la ventana. Un
 * contenedor no puede tener más espacio útil que la ventana que lo contiene,
 * así que si alguna de las dos medidas viene inflada, la otra la acota.
 *
 * OPS-BUG-01: en dos Android reales (Xiaomi 13 Pro, Samsung A55 5G) el grid
 * salía a 2 columnas apretadas y los campos se superponían. Fallaron tres
 * intentos —media query de viewport (`sm:`), container queries CSS, y medir el
 * contenedor con ResizeObserver— y los tres preguntaban lo mismo: "cuánto mide
 * mi contenedor". Como el modo de falla del hook es seguro (sin observer no se
 * activan las 2 columnas), ver 2 columnas apretadas prueba que la medición del
 * contenedor devuelve más ancho que la pantalla física. Mirar también la
 * ventana neutraliza esa familia de causas sin depender de cuál sea.
 */
export function hayEspacioParaDosColumnas(
  anchoContenedor: number,
  anchoVentana: number,
  breakpointPx: number
): boolean {
  return Math.min(anchoContenedor, anchoVentana) >= breakpointPx;
}

/**
 * Decide 2 columnas midiendo el ancho real renderizado, en vez de confiar en
 * media queries de viewport o en container queries CSS. Arranca en 1 columna:
 * antes del primer callback no hay medida, y equivocarse ahí es justo el bug
 * que se ve en pantalla.
 */
export function useDosColumnas<T extends HTMLElement>(breakpointPx: number) {
  const ref = useRef<T | null>(null);
  const [dosColumnas, setDosColumnas] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const recalcular = (anchoContenedor: number) => {
      setDosColumnas(
        hayEspacioParaDosColumnas(anchoContenedor, window.innerWidth, breakpointPx)
      );
    };

    const observer = new ResizeObserver((entries) => {
      recalcular(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);

    // La ventana puede cambiar sin que cambie el contenedor (rotar el teléfono,
    // que aparezca el teclado): sin esto la decisión quedaría con el ancho de
    // ventana viejo.
    const alRedimensionar = () => recalcular(el.getBoundingClientRect().width);
    window.addEventListener("resize", alRedimensionar);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", alRedimensionar);
    };
  }, [breakpointPx]);

  return { ref, dosColumnas };
}
