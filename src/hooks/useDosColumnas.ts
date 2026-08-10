"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Decide 2 columnas midiendo el ancho real del contenedor con ResizeObserver
 * en vez de container queries CSS: en algunos WebView/Chrome de Android el
 * soporte de `container-type: inline-size` + `minmax(0,1fr)` es incompleto
 * y el grid queda desparejo aunque el breakpoint esté bien puesto.
 */
export function useDosColumnas<T extends HTMLElement>(breakpointPx: number) {
  const ref = useRef<T | null>(null);
  const [dosColumnas, setDosColumnas] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const ancho = entries[0]?.contentRect.width ?? 0;
      setDosColumnas(ancho >= breakpointPx);
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [breakpointPx]);

  return { ref, dosColumnas };
}
