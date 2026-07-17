import type {
  Divisa,
  SubTipoAccion,
  SubTipoCrypto,
  TipoActivo,
} from "@/types/trading";

/**
 * Capa de Dominio (importación). Modela UNA ejecución cruda tal como la
 * exportan las plataformas (una compra o una venta suelta), de forma agnóstica:
 * unifica un fill de IOL con uno de Bitget bajo la misma forma. La reconstrucción
 * de "operaciones redondas" (emparejar compras con ventas) es un paso posterior
 * que se decide sobre datos reales — este tipo es el denominador común previo.
 */

export type PlataformaImport = "iol" | "bitget" | "propio";

/** Lado de la ejecución, normalizado desde Buy/Sell, Compra/Venta, Open/Close. */
export type LadoMovimiento = "compra" | "venta";

export interface MovimientoImportado {
  /** Fecha normalizada a YYYY-MM-DD. */
  fecha: string;
  /** Símbolo/activo normalizado (ej. "BTCUSDT", "AAPL"). */
  activo: string;
  tipoActivo: TipoActivo;
  subTipoActivo?: SubTipoAccion | SubTipoCrypto;
  divisa: Divisa;
  lado: LadoMovimiento;
  /** Unidades ejecutadas (siempre positivas). */
  cantidad: number;
  /** Precio de ejecución por unidad. */
  precio: number;
  /** Solo Bitget futuros. */
  apalancamiento?: number;
  /** PnL realizado si la plataforma lo provee (Bitget futuros por posición). */
  pnlRealizado?: number;
  /** Comisión de la ejecución, si viene informada. */
  fee?: number;
  origen: PlataformaImport;
  /** Nº de fila en el archivo original (1-based, sin contar encabezado). */
  filaOriginal: number;
}

/** Fila que no se pudo interpretar, con el motivo, para mostrar en el preview. */
export interface ErrorFila {
  fila: number;
  motivo: string;
}

/** Resultado de parsear un archivo: lo que se entendió + lo que se descartó. */
export interface ResultadoParseo {
  movimientos: MovimientoImportado[];
  errores: ErrorFila[];
}
