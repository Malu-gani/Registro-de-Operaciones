"use client";

import { useState } from "react";

interface OpcionesListaPaginada {
  /** Cuántos items se muestran colapsado, antes de "Ver más". Default 5. */
  inicial?: number;
  /** Tamaño del bloque una vez que se activa la paginación real. Default 10. */
  tamanoPagina?: number;
  /** Si true, el estado expandido ofrece un botón "Minimizar" para colapsar. */
  conMinimizar?: boolean;
}

interface ListaPaginada<T> {
  visibles: T[];
  totalCount: number;
  mostrarVerMas: boolean;
  mostrarMinimizar: boolean;
  mostrarPaginador: boolean;
  pagina: number;
  totalPaginas: number;
  verMas: () => void;
  colapsar: () => void;
  irAPagina: (pagina: number) => void;
}

/**
 * Paginación progresiva para listas ya cargadas en memoria.
 *
 * - Sin `conMinimizar` (listas vivas, ej. Posiciones Abiertas): hasta `inicial`
 *   sin controles; entre `inicial` y `tamanoPagina` aparece "Maximizar"; por
 *   encima de `tamanoPagina`, paginación real de una.
 * - Con `conMinimizar` (historiales): SIEMPRE arranca colapsado en `inicial`
 *   (aunque haya para paginar). Al maximizar, si supera `tamanoPagina` se pagina
 *   en bloques de `tamanoPagina`; y siempre se ofrece "Minimizar" para volver a
 *   colapsar en `inicial`.
 */
export function useListaPaginada<T>(
  items: T[],
  { inicial = 5, tamanoPagina = 10, conMinimizar = false }: OpcionesListaPaginada = {}
): ListaPaginada<T> {
  const [expandido, setExpandido] = useState(false);
  const [pagina, setPagina] = useState(1);

  const puedeColapsar = items.length > inicial;

  // Historiales: el colapsado inicial (5) tiene prioridad sobre la paginación,
  // así que hasta que no se maximiza se ven solo `inicial`, sin importar el total.
  if (conMinimizar && puedeColapsar && !expandido) {
    return {
      visibles: items.slice(0, inicial),
      totalCount: items.length,
      mostrarVerMas: true,
      mostrarMinimizar: false,
      mostrarPaginador: false,
      pagina: 1,
      totalPaginas: 1,
      verMas: () => setExpandido(true),
      colapsar: () => {},
      irAPagina: () => {},
    };
  }

  // Paginación real (más de un bloque). En historiales se llega acá recién al
  // maximizar; se mantiene el botón "Minimizar" junto al paginador.
  if (items.length > tamanoPagina) {
    const totalPaginas = Math.ceil(items.length / tamanoPagina);
    const paginaSegura = Math.min(pagina, totalPaginas);
    const inicioIdx = (paginaSegura - 1) * tamanoPagina;
    return {
      visibles: items.slice(inicioIdx, inicioIdx + tamanoPagina),
      totalCount: items.length,
      mostrarVerMas: false,
      mostrarMinimizar: conMinimizar,
      mostrarPaginador: true,
      pagina: paginaSegura,
      totalPaginas,
      verMas: () => {},
      colapsar: () => {
        setPagina(1);
        setExpandido(false);
      },
      irAPagina: setPagina,
    };
  }

  // Entre `inicial` y `tamanoPagina`, colapsado (lista viva no expandida aún).
  if (puedeColapsar && !expandido) {
    return {
      visibles: items.slice(0, inicial),
      totalCount: items.length,
      mostrarVerMas: true,
      mostrarMinimizar: false,
      mostrarPaginador: false,
      pagina: 1,
      totalPaginas: 1,
      verMas: () => setExpandido(true),
      colapsar: () => {},
      irAPagina: () => {},
    };
  }

  // Todo visible (pocos items, o expandido sin llegar a paginar).
  return {
    visibles: items,
    totalCount: items.length,
    mostrarVerMas: false,
    mostrarMinimizar: conMinimizar && expandido && puedeColapsar,
    mostrarPaginador: false,
    pagina: 1,
    totalPaginas: 1,
    verMas: () => {},
    colapsar: () => setExpandido(false),
    irAPagina: () => {},
  };
}

/** Controles de "Ver más" / "Minimizar" / paginador para renderizar debajo de una lista. */
export function ControlesListaPaginada({
  visiblesCount,
  totalCount,
  mostrarVerMas,
  mostrarMinimizar = false,
  mostrarPaginador,
  pagina,
  totalPaginas,
  verMas,
  colapsar = () => {},
  irAPagina,
}: Pick<
  ListaPaginada<unknown>,
  | "totalCount"
  | "mostrarVerMas"
  | "mostrarPaginador"
  | "pagina"
  | "totalPaginas"
  | "verMas"
  | "irAPagina"
> & {
  visiblesCount: number;
  mostrarMinimizar?: boolean;
  colapsar?: () => void;
}) {
  if (mostrarVerMas) {
    return (
      <div className="flex justify-center pt-3">
        <button
          type="button"
          onClick={verMas}
          className="rounded-md border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground"
        >
          Maximizar ({totalCount})
        </button>
      </div>
    );
  }

  if (!mostrarPaginador && !mostrarMinimizar) return null;

  // Maximizado: paginador (si supera un bloque) y "Minimizar" para volver a
  // colapsar. Pueden aparecer juntos en un historial largo.
  return (
    <div className="flex flex-col gap-2 pt-3">
      {mostrarPaginador && (
        <div className="flex items-center justify-between text-xs text-foreground-muted">
          <button
            type="button"
            onClick={() => irAPagina(pagina - 1)}
            disabled={pagina <= 1}
            className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-surface-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Anterior
          </button>
          <span>
            Página {pagina} de {totalPaginas} · {visiblesCount} de {totalCount}
          </span>
          <button
            type="button"
            onClick={() => irAPagina(pagina + 1)}
            disabled={pagina >= totalPaginas}
            className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-surface-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Siguiente
          </button>
        </div>
      )}
      {mostrarMinimizar && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={colapsar}
            className="rounded-md border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground"
          >
            Minimizar
          </button>
        </div>
      )}
    </div>
  );
}
