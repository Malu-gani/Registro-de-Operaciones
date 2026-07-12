import type {
  TradeInputsApalancado,
  TradeInputsCantidadFija,
  RiskAnalysis,
} from "../types/trading";

export type ClaseActivo = "acciones" | "cripto_spot" | "futuros";
export type NivelRiesgo = "bajo" | "medio" | "alto" | "critico";

interface UmbralRiesgo {
  /** % máximo (inclusive) que todavía pertenece a este nivel. */
  limite: number;
  nivel: NivelRiesgo;
}

/**
 * Matriz de umbrales del semáforo de riesgo, un juego de rangos por clase
 * de activo (cada uno mide el % de riesgo sobre una base distinta: capital
 * invertido para Acciones/CEDEARs y Cripto Spot, valor nocional para
 * Futuros — ver `analizarConTamañoPosicion`). Los rangos son
 * `(límite anterior, límite actual]`, o sea el límite superior de cada
 * nivel es inclusive; el primer nivel además incluye el 0%.
 */
const MATRIZ_RIESGO: Record<ClaseActivo, UmbralRiesgo[]> = {
  acciones: [
    { limite: 3, nivel: "bajo" },
    { limite: 8, nivel: "medio" },
    { limite: 15, nivel: "alto" },
    { limite: 100, nivel: "critico" },
  ],
  cripto_spot: [
    { limite: 5, nivel: "bajo" },
    { limite: 15, nivel: "medio" },
    { limite: 25, nivel: "alto" },
    { limite: 100, nivel: "critico" },
  ],
  futuros: [
    { limite: 1, nivel: "bajo" },
    { limite: 3, nivel: "medio" },
    { limite: 10, nivel: "alto" },
    { limite: 100, nivel: "critico" },
  ],
};

/**
 * Determina el nivel de riesgo (semáforo) de un % de riesgo según la clase
 * de activo. Cada umbral es inclusive (`<=`) para que un valor exactamente
 * en el límite (ej. 3.00% en Acciones) caiga en el nivel de abajo, y
 * cualquier valor apenas mayor (3.01%) ya caiga en el de arriba — sin
 * puntos ciegos ni superposición entre rangos.
 */
export function getRiskLevel(
  porcentaje: number,
  claseActivo: ClaseActivo
): NivelRiesgo {
  const umbrales = MATRIZ_RIESGO[claseActivo];
  for (const umbral of umbrales) {
    if (porcentaje <= umbral.limite) {
      return umbral.nivel;
    }
  }
  return "critico";
}

/**
 * Calcula el ratio Riesgo/Beneficio (R:R).
 * Fórmula: |TakeProfit - Entrada| / |Entrada - StopLoss|
 */
export function calcularRatioRiesgoBeneficio(
  precioEntrada: number,
  precioStopLoss: number,
  precioTakeProfit: number
): number {
  const riesgoPorUnidad = Math.abs(precioEntrada - precioStopLoss);
  const recompensaPorUnidad = Math.abs(precioTakeProfit - precioEntrada);

  if (riesgoPorUnidad === 0) {
    return 0;
  }

  return recompensaPorUnidad / riesgoPorUnidad;
}

/**
 * Núcleo común: dado un tamaño de posición ya determinado (sea por margen x
 * apalancamiento, o por cantidad fija elegida a mano), calcula R:R y
 * proyecciones de pérdida/ganancia. El % de riesgo se expresa como fracción
 * del capital invertido en la propia operación (valorPosicion), no del
 * balance total de la cuenta.
 *
 * Stop Loss y Take Profit son opcionales: sin ellos no se puede calcular
 * pérdida/ganancia máxima ni R:R, pero sí tamaño y valor de la posición.
 */
function analizarConTamañoPosicion(
  tamañoPosicion: number,
  inputs: {
    precioEntrada: number;
    precioStopLoss?: number;
    precioTakeProfit?: number;
    tipoOperacion: "long" | "short";
  }
): RiskAnalysis {
  const { precioEntrada, precioStopLoss, precioTakeProfit, tipoOperacion } = inputs;
  const esLong = tipoOperacion === "long";

  if (!precioEntrada) {
    throw new Error("No se introdujo el precio de entrada.");
  }
  if (precioStopLoss && precioStopLoss === precioEntrada) {
    throw new Error("El precio de Stop Loss no puede ser igual al precio de entrada.");
  }
  if (precioStopLoss) {
    const stopLossValido = esLong
      ? precioStopLoss < precioEntrada
      : precioStopLoss > precioEntrada;
    if (!stopLossValido) {
      throw new Error(
        esLong
          ? "Para una operación Long, el Stop Loss debe ser menor al precio de entrada."
          : "Para una operación Short, el Stop Loss debe ser mayor al precio de entrada."
      );
    }
  }
  if (precioTakeProfit) {
    const takeProfitValido = esLong
      ? precioTakeProfit > precioEntrada
      : precioTakeProfit < precioEntrada;
    if (!takeProfitValido) {
      throw new Error(
        esLong
          ? "Para una operación Long, el Take Profit debe ser mayor al precio de entrada."
          : "Para una operación Short, el Take Profit debe ser menor al precio de entrada."
      );
    }
  }

  const valorPosicion = tamañoPosicion * precioEntrada;

  let riesgoPorUnidad: number | undefined;
  let perdidaMaximaMonetaria: number | undefined;
  let perdidaMaximaPorcentaje: number | undefined;
  if (precioStopLoss) {
    riesgoPorUnidad = esLong
      ? precioEntrada - precioStopLoss
      : precioStopLoss - precioEntrada;
    perdidaMaximaMonetaria = tamañoPosicion * riesgoPorUnidad;
    perdidaMaximaPorcentaje = (perdidaMaximaMonetaria / valorPosicion) * 100;
  }

  let recompensaPorUnidad: number | undefined;
  let gananciaMaximaMonetaria: number | undefined;
  let gananciaMaximaPorcentaje: number | undefined;
  if (precioTakeProfit) {
    recompensaPorUnidad = esLong
      ? precioTakeProfit - precioEntrada
      : precioEntrada - precioTakeProfit;
    gananciaMaximaMonetaria = tamañoPosicion * recompensaPorUnidad;
    gananciaMaximaPorcentaje = (gananciaMaximaMonetaria / valorPosicion) * 100;
  }

  const ratioRiesgoBeneficio =
    riesgoPorUnidad && recompensaPorUnidad
      ? recompensaPorUnidad / riesgoPorUnidad
      : undefined;

  return {
    tamañoPosicion,
    valorPosicion,
    riesgoPorUnidad,
    riesgoMonetario: perdidaMaximaMonetaria,
    ratioRiesgoBeneficio,
    perdidaMaximaMonetaria,
    perdidaMaximaPorcentaje,
    gananciaMaximaMonetaria,
    gananciaMaximaPorcentaje,
  };
}

/**
 * Análisis de riesgo para operaciones crypto con margen/apalancamiento
 * (futuros) o compra directa (spot, con apalancamiento=1). El tamaño de
 * posición sale del margen invertido (monto) multiplicado por el
 * apalancamiento: posición real = monto x apalancamiento.
 */
export function analizarRiesgoApalancado(
  inputs: TradeInputsApalancado
): RiskAnalysis {
  const tamañoPosicion = (inputs.monto * inputs.apalancamiento) / inputs.precioEntrada;
  return analizarConTamañoPosicion(tamañoPosicion, inputs);
}

/**
 * Análisis de riesgo cuando la cantidad de unidades la elige el usuario
 * directamente (ej. cantidad de CEDEARs), en vez de derivarla del % de riesgo.
 */
export function analizarRiesgoPosicionFija(
  inputs: TradeInputsCantidadFija
): RiskAnalysis {
  return analizarConTamañoPosicion(inputs.cantidad, inputs);
}

/**
 * P&L real de una operación cerrada.
 * Long: ganás si el precio sube. Short: ganás si el precio baja.
 */
export function calcularPnl(
  tipoOperacion: "long" | "short",
  precioEntrada: number,
  precioSalida: number,
  cantidad: number
): number {
  const diferencia =
    tipoOperacion === "long" ? precioSalida - precioEntrada : precioEntrada - precioSalida;
  return diferencia * cantidad;
}

/**
 * Interés y fecha de vencimiento de un plazo fijo.
 * Fórmula simple (interés no capitalizable): Monto x (TNA/100) x (Días/365)
 */
export function calcularPlazoFijo(
  monto: number,
  tasaTna: number,
  plazoDias: number,
  fechaInicio: string
): { interesEstimado: number; fechaVencimiento: string } {
  const interesEstimado = monto * (tasaTna / 100) * (plazoDias / 365);

  const inicio = new Date(`${fechaInicio}T00:00:00`);
  const vencimiento = new Date(inicio);
  vencimiento.setDate(vencimiento.getDate() + plazoDias);
  const fechaVencimiento = vencimiento.toISOString().slice(0, 10);

  return { interesEstimado, fechaVencimiento };
}

/**
 * Un plazo fijo se considera vencido (y pasa a mostrarse en Historial en
 * vez de en Posiciones Abiertas) apenas se alcanza su fecha de
 * vencimiento — no depende de ninguna acción manual del usuario ni de un
 * job en el servidor, se deriva comparando contra la fecha de hoy en cada
 * render.
 */
export function plazoFijoVencido(fechaVencimiento: string): boolean {
  return fechaVencimiento <= new Date().toISOString().slice(0, 10);
}
