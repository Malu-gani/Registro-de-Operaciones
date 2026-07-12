export type TipoActivo = "acciones" | "crypto";
export type SubTipoAccion = "cedear" | "usd";
export type SubTipoCrypto = "spot" | "futuros";
export type Divisa = "USD" | "ARS" | "USDT";
export type TipoMercadoPortafolio = "cripto" | "acciones" | "mixto";

/**
 * Portafolio del usuario (tabla `portafolios`). `tipoMercado` es solo
 * informativo — no restringe qué tipo de operaciones se pueden cargar.
 */
export interface Portafolio {
  id: string;
  nombre: string;
  tipoMercado: TipoMercadoPortafolio;
  createdAt: string;
}

/**
 * Inputs de una operación crypto con margen: el tamaño de posición sale de
 * monto x apalancamiento (en spot, apalancamiento siempre es 1).
 */
export interface TradeInputsApalancado {
  precioEntrada: number;
  precioStopLoss?: number;
  precioTakeProfit?: number;
  monto: number;
  apalancamiento: number;
  tipoOperacion: "long" | "short";
}

/**
 * Inputs cuando la cantidad de unidades la elige el usuario directamente
 * (acciones, CEDEARs).
 */
export interface TradeInputsCantidadFija {
  precioEntrada: number;
  precioStopLoss?: number;
  precioTakeProfit?: number;
  cantidad: number;
  tipoOperacion: "long" | "short";
}

/**
 * Resultado completo del análisis de riesgo de una operación. Stop Loss y
 * Take Profit son opcionales al cargar una operación, así que todo lo que
 * depende de ellos (R:R, pérdida/ganancia máxima) puede no estar disponible.
 */
export interface RiskAnalysis {
  tamañoPosicion: number;
  valorPosicion: number;
  riesgoPorUnidad?: number;
  riesgoMonetario?: number;
  ratioRiesgoBeneficio?: number;
  perdidaMaximaMonetaria?: number;
  perdidaMaximaPorcentaje?: number;
  gananciaMaximaMonetaria?: number;
  gananciaMaximaPorcentaje?: number;
}

/**
 * Operación registrada en el diario (tabla `operaciones` del modelo de datos).
 */
export interface Trade {
  id: string;
  portafolioId: string;
  activo: string;
  tipoActivo: TipoActivo;
  subTipoActivo?: SubTipoAccion | SubTipoCrypto;
  divisa: Divisa;
  apalancamiento?: number;
  tipoOperacion: "long" | "short";
  fechaEntrada: string;
  precioEntrada: number;
  precioStopLoss?: number;
  precioTakeProfit?: number;
  cantidad: number;
  fechaSalida?: string;
  precioSalida?: number;
  estado: "abierta" | "cerrada";
  resultadoPnl?: number;
  ratioRiesgoBeneficio?: number;
  porcentajeRiesgoOperacion?: number;
  notas?: string;
}

/**
 * Plazo fijo: registro separado de las operaciones, sin panel de riesgo
 * (no tiene stop loss ni take profit).
 */
export interface PlazoFijo {
  id: string;
  portafolioId: string;
  monto: number;
  divisa: "USD" | "ARS";
  tasaTna: number;
  plazoDias: number;
  fechaInicio: string;
  fechaVencimiento: string;
  interesEstimado: number;
  notas?: string;
}

/**
 * Movimiento manual (depósito o retiro) de la cuenta de Futuros del
 * portafolio. El balance de Futuros no es un campo suelto: se calcula
 * sumando estos movimientos más el resultado_pnl de las operaciones
 * crypto futuros ya cerradas.
 */
export interface MovimientoFuturos {
  id: string;
  portafolioId: string;
  monto: number; // positivo = depósito, negativo = retiro
  fecha: string;
  notas?: string;
}
