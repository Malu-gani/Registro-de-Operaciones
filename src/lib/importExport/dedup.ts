import type { Trade } from "@/types/trading";
import type { OperacionReconstruida } from "./fifoReconstruction";

/**
 * Detección de operaciones duplicadas al importar. No hay un ID externo estable
 * en los archivos de broker ni en el export propio, así que se identifica cada
 * operación por una firma determinística de sus campos estables. Sirve tanto
 * para `Trade` (operaciones ya cargadas) como para `OperacionReconstruida` (las
 * que se van a importar): ambos comparten estos campos.
 */

/** Campos necesarios para la firma; `Trade` y `OperacionReconstruida` los cumplen. */
export interface ClaveOperacionInput {
  activo: string;
  subTipoActivo?: string;
  divisa: string;
  tipoOperacion: string;
  estado: string;
  fechaEntrada: string;
  precioEntrada: number;
  cantidad: number;
  fechaSalida?: string;
  precioSalida?: number;
}

/**
 * Redondea a `dec` decimales para tolerar diferencias de coma flotante
 * (p. ej. 100 vs 100.000000001 → misma firma). Vacío si no es finito.
 */
function num(v: number | undefined, dec = 8): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "";
  return v.toFixed(dec);
}

/**
 * Firma determinística de una operación. Incluye entrada y salida/estado para no
 * colapsar una parcial cerrada distinta ni confundir una abierta con su versión
 * cerrada del mismo lote.
 */
export function claveOperacion(o: ClaveOperacionInput): string {
  return [
    o.activo,
    o.subTipoActivo ?? "",
    o.divisa,
    o.tipoOperacion,
    o.estado,
    o.fechaEntrada,
    num(o.precioEntrada),
    num(o.cantidad),
    o.fechaSalida ?? "",
    num(o.precioSalida),
  ].join("|");
}

/**
 * Marca cuáles de `ops` ya existen. Una operación es duplicada si su firma
 * coincide con una operación ya cargada (`existentes`) o con otra fila anterior
 * del mismo archivo (evita cargar dos veces lo mismo de una sola importación).
 */
export function marcarDuplicados(
  ops: OperacionReconstruida[],
  existentes: Trade[]
): boolean[] {
  const claves = new Set(existentes.map(claveOperacion));
  const vistos = new Set<string>();
  return ops.map((op) => {
    const k = claveOperacion(op);
    const dup = claves.has(k) || vistos.has(k);
    vistos.add(k);
    return dup;
  });
}
