export type TipoActivo = "acciones" | "crypto";
export type SubTipoAccion = "cedear" | "usd";
export type SubTipoCrypto = "spot" | "futuros";
export type Divisa = "USD" | "ARS" | "USDT";
export type TipoMercadoPortafolio = "cripto" | "acciones" | "mixto";

/**
 * Las 4 cuentas (bolsillos) que tiene cada portafolio, una por divisa/mercado.
 * Spot y Futuros son billeteras USDT separadas (como en un exchange real).
 */
export type CuentaId = "ars" | "usd" | "usdt_spot" | "usdt_futuros";

/**
 * Tipos de movimiento del ledger de cuenta. `deposito`/`retiro` los hace el
 * usuario; el resto son automáticos (auditoría de aperturas/cierres de
 * operaciones y plazos). El signo del monto define si entra o sale del
 * Disponible.
 */
export type TipoMovimientoCuenta =
  | "deposito"
  | "retiro"
  | "ajuste_inicial"
  | "apertura"
  | "cierre"
  | "plazo_apertura"
  | "plazo_liquidacion";

/**
 * Portafolio del usuario (tabla `portafolios`). `tipoMercado` restringe qué
 * cuentas y qué operaciones admite el portafolio (ver `utils/tipoMercado.ts`):
 * Acciones -> ARS/USD, Cripto -> USDT Spot/Futuros, Mixto -> todo.
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
  estado: "pendiente" | "liquidado";
  notas?: string;
}

/**
 * Saldo Disponible (Capital No Comprometido) de una cuenta de un portafolio.
 * El Comprometido no vive acá: se deriva de las posiciones abiertas.
 */
export interface SaldoCuenta {
  portafolioId: string;
  cuenta: CuentaId;
  disponible: number;
}

/**
 * Movimiento del ledger de cuenta (tabla `movimientos_cuenta`). Reemplaza a
 * MovimientoFuturos: es el historial de depósitos/retiros más la auditoría de
 * aperturas/cierres. `monto` con signo: positivo entra al Disponible.
 */
export interface MovimientoCuenta {
  id: string;
  portafolioId: string;
  cuenta: CuentaId;
  tipo: TipoMovimientoCuenta;
  monto: number;
  fecha: string;
  notas?: string;
  refOperacionId?: string;
}
