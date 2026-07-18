import type {
  PlazoFijo,
  SubTipoAccion,
  SubTipoCrypto,
  TipoActivo,
  Trade,
} from "@/types/trading";

/**
 * Segmentación del export: el usuario elige QUÉ tipos incluir y, por cada tipo,
 * el estado (todas / abiertas / cerradas). Los 4 segmentos de operación mapean
 * a los mismos pares (tipoActivo, subTipoActivo) que las pestañas del Historial;
 * los plazos fijos son un tipo aparte con su propio esquema de columnas.
 */

export type EstadoFiltro = "todas" | "abiertas" | "cerradas";

export interface SegmentoOperacion {
  id: "acciones-usd" | "cedears" | "crypto-spot" | "crypto-futuros";
  label: string;
  tipoActivo: TipoActivo;
  subTipoActivo: SubTipoAccion | SubTipoCrypto;
}

/** Los 4 segmentos de operación, en el mismo orden que las tabs del Historial. */
export const SEGMENTOS_OPERACION: SegmentoOperacion[] = [
  { id: "acciones-usd", label: "Acciones USD", tipoActivo: "acciones", subTipoActivo: "usd" },
  { id: "cedears", label: "CEDEARs", tipoActivo: "acciones", subTipoActivo: "cedear" },
  { id: "crypto-spot", label: "Cripto Spot", tipoActivo: "crypto", subTipoActivo: "spot" },
  { id: "crypto-futuros", label: "Cripto Futuros", tipoActivo: "crypto", subTipoActivo: "futuros" },
];

/** Filtra los trades de un segmento (tipo + subtipo) por estado. */
export function filtrarTrades(
  trades: Trade[],
  seg: SegmentoOperacion,
  estado: EstadoFiltro
): Trade[] {
  return trades.filter((t) => {
    if (t.tipoActivo !== seg.tipoActivo) return false;
    if (t.subTipoActivo !== seg.subTipoActivo) return false;
    if (estado === "abiertas") return t.estado === "abierta";
    if (estado === "cerradas") return t.estado === "cerrada";
    return true;
  });
}

/**
 * Filtra los plazos fijos por estado. El mapeo con el vocabulario de
 * operaciones: abiertas ↔ `pendiente`, cerradas ↔ `liquidado`.
 */
export function filtrarPlazos(plazos: PlazoFijo[], estado: EstadoFiltro): PlazoFijo[] {
  if (estado === "abiertas") return plazos.filter((p) => p.estado === "pendiente");
  if (estado === "cerradas") return plazos.filter((p) => p.estado === "liquidado");
  return plazos;
}
