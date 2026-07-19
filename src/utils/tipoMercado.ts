import type { CuentaId, TipoMercadoPortafolio } from "@/types/trading";

/**
 * Reglas de qué admite cada tipo de portafolio. `tipoMercado` deja de ser
 * solo informativo: restringe qué cuentas (bolsillos) y qué operaciones se
 * pueden usar, para que elegir el tipo al crear el portafolio tenga efecto.
 *
 * - `acciones` -> mercados en pesos/dólares: cuentas ARS y USD; operaciones de
 *   Acciones/CEDEARs y Plazos fijos (ambos instrumentos fiat).
 * - `cripto`   -> billeteras USDT (Spot y Futuros); operaciones de Cripto.
 * - `mixto`    -> todo.
 */

/** Identificadores de las pestañas/tipos de operación de "Nueva Operación". */
export type TipoOperacionForm = "acciones" | "crypto" | "plazo-fijo";

const CUENTAS_POR_MERCADO: Record<TipoMercadoPortafolio, CuentaId[]> = {
  acciones: ["ars", "usd"],
  cripto: ["usdt_spot", "usdt_futuros"],
  mixto: ["ars", "usd", "usdt_spot", "usdt_futuros"],
};

const OPERACIONES_POR_MERCADO: Record<TipoMercadoPortafolio, TipoOperacionForm[]> = {
  acciones: ["acciones", "plazo-fijo"],
  cripto: ["crypto"],
  mixto: ["acciones", "crypto", "plazo-fijo"],
};

/** Cuentas (bolsillos) que admite un portafolio según su tipo de mercado. */
export function cuentasDeMercado(tipo: TipoMercadoPortafolio): CuentaId[] {
  return CUENTAS_POR_MERCADO[tipo];
}

/** Tipos de operación que admite un portafolio según su tipo de mercado. */
export function operacionesDeMercado(
  tipo: TipoMercadoPortafolio
): TipoOperacionForm[] {
  return OPERACIONES_POR_MERCADO[tipo];
}

/** true si el portafolio admite ese tipo de operación. */
export function admiteOperacion(
  tipo: TipoMercadoPortafolio,
  operacion: TipoOperacionForm
): boolean {
  return OPERACIONES_POR_MERCADO[tipo].includes(operacion);
}

const LABEL_MERCADO: Record<TipoMercadoPortafolio, string> = {
  acciones: "Acciones",
  cripto: "Cripto",
  mixto: "Mixto",
};

/** Etiqueta legible del tipo de mercado (Acciones/Cripto/Mixto). */
export function labelMercado(tipo: TipoMercadoPortafolio): string {
  return LABEL_MERCADO[tipo];
}

/**
 * Mensaje de error cuando se intenta cargar una operación en un portafolio que
 * no la admite (ej. una operación de cripto en un portafolio de Acciones).
 */
export function mensajeOperacionNoAdmitida(
  tipo: TipoMercadoPortafolio,
  operacion: TipoOperacionForm
): string {
  const queCosa =
    operacion === "crypto"
      ? "operaciones de cripto"
      : operacion === "acciones"
        ? "operaciones de acciones/CEDEARs"
        : "plazos fijos";
  return `Este portafolio es de tipo ${LABEL_MERCADO[tipo]} y no admite ${queCosa}. Use un portafolio Mixto${operacion === "crypto" ? " o de Cripto" : " o de Acciones"}.`;
}
