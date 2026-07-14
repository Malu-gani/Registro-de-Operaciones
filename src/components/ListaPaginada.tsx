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
 * Paginación progresiva para listas ya cargadas en memoria: hasta `inicial`
 * items no hay controles; entre `inicial` y `tamanoPagina` aparece "Ver más"
 * (y, si `conMinimizar`, "Minimizar" para volver a colapsar); por encima de
 * `tamanoPagina` se activa paginación real en bloques de `tamanoPagina`.
 */
export function useListaPaginada<T>(
  items: T[],
  { inicial = 5, tamanoPagina = 10, conMinimizar = false }: OpcionesListaPaginada = {}
): ListaPaginada<T> {
  const [expandido, setExpandido] = useState(false);
  const [pagina, setPagina] = useState(1);

  if (items.length > tamanoPagina) {
    const totalPaginas = Math.ceil(items.length / tamanoPagina);
    const paginaSegura = Math.min(pagina, totalPaginas);
    const inicioIdx = (paginaSegura - 1) * tamanoPagina;
    return {
      visibles: items.slice(inicioIdx, inicioIdx + tamanoPagina),
      totalCount: items.length,
      mostrarVerMas: false,
      mostrarMinimizar: false,
      mostrarPaginador: true,
      pagina: paginaSegura,
      totalPaginas,
      verMas: () => {},
      colapsar: () => {},
      irAPagina: setPagina,
    };
  }

  if (items.length > inicial && !expandido) {
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

  return {
    visibles: items,
    totalCount: items.length,
    mostrarVerMas: false,
    mostrarMinimizar: conMinimizar && expandido && items.length > inicial,
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
          Ver los {totalCount} registros
        </button>
      </div>
    );
  }

  if (mostrarMinimizar) {
    return (
      <div className="flex justify-center pt-3">
        <button
          type="button"
          onClick={colapsar}
          className="rounded-md border border-border px-4 py-1.5 text-xs font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground"
        >
          Minimizar
        </button>
      </div>
    );
  }

  if (mostrarPaginador) {
    return (
      <div className="flex items-center justify-between pt-3 text-xs text-foreground-muted">
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
    );
  }

  return null;
}
