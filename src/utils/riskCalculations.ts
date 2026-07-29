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
 * Cortes editables del semáforo por clase de activo: el % máximo (inclusive)
 * de cada nivel hasta `alto`. El nivel `critico` es implícito (todo lo que
 * supera `alto`), por eso no se guarda. Es la forma que persiste la tabla
 * `preferencias_usuario.umbrales_riesgo` y la que edita la pestaña Ajustes.
 */
export interface CortesRiesgo {
  bajo: number;
  medio: number;
  alto: number;
}

/** Cortes de las tres clases de activo (única fuente de verdad de la forma). */
export type UmbralesRiesgo = Record<ClaseActivo, CortesRiesgo>;

/**
 * Valores por defecto del semáforo. Cada clase mide el % de riesgo sobre una
 * base distinta: capital invertido para Acciones/CEDEARs y Cripto Spot, valor
 * nocional para Futuros — ver `analizarConTamañoPosicion`. Si el usuario no
 * personalizó sus umbrales, la app usa estos.
 */
export const UMBRALES_RIESGO_DEFAULT: UmbralesRiesgo = {
  acciones: { bajo: 3, medio: 8, alto: 15 },
  cripto_spot: { bajo: 5, medio: 15, alto: 25 },
  futuros: { bajo: 1, medio: 3, alto: 10 },
};

/**
 * Arma la matriz de rangos a partir de los cortes editables. Los rangos son
 * `(límite anterior, límite actual]`, o sea el límite superior de cada nivel
 * es inclusive; el primer nivel además incluye el 0%. `critico` cierra en 100.
 */
export function construirMatrizRiesgo(
  umbrales: UmbralesRiesgo
): Record<ClaseActivo, UmbralRiesgo[]> {
  const porClase = (c: CortesRiesgo): UmbralRiesgo[] => [
    { limite: c.bajo, nivel: "bajo" },
    { limite: c.medio, nivel: "medio" },
    { limite: c.alto, nivel: "alto" },
    { limite: 100, nivel: "critico" },
  ];
  return {
    acciones: porClase(umbrales.acciones),
    cripto_spot: porClase(umbrales.cripto_spot),
    futuros: porClase(umbrales.futuros),
  };
}

/**
 * Determina el nivel de riesgo (semáforo) de un % de riesgo según la clase
 * de activo. Cada umbral es inclusive (`<=`) para que un valor exactamente
 * en el límite (ej. 3.00% en Acciones) caiga en el nivel de abajo, y
 * cualquier valor apenas mayor (3.01%) ya caiga en el de arriba — sin
 * puntos ciegos ni superposición entre rangos.
 *
 * `umbrales` permite pasar los cortes personalizados del usuario; si se omite,
 * usa los valores por defecto (comportamiento histórico).
 */
export function getRiskLevel(
  porcentaje: number,
  claseActivo: ClaseActivo,
  umbrales: UmbralesRiesgo = UMBRALES_RIESGO_DEFAULT
): NivelRiesgo {
  const matriz = construirMatrizRiesgo(umbrales);
  for (const umbral of matriz[claseActivo]) {
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

  return { interesEstimado, fechaVencimiento: fechaISOLocal(vencimiento) };
}

/**
 * "YYYY-MM-DD" del día tal como lo ve el usuario, no en UTC.
 *
 * `toISOString()` convierte a UTC antes de recortar, así que en Argentina
 * (UTC-3) a partir de las 21:00 devuelve la fecha del día siguiente. Las fechas
 * de este dominio son días de calendario, no instantes: comparar contra la
 * fecha UTC adelanta un día los vencimientos toda la tarde-noche.
 */
export function fechaISOLocal(fecha: Date = new Date()): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/**
 * Un plazo fijo se considera vencido (y pasa a mostrarse en Historial en
 * vez de en Posiciones Abiertas) apenas se alcanza su fecha de
 * vencimiento — no depende de ninguna acción manual del usuario ni de un
 * job en el servidor, se deriva comparando contra la fecha de hoy en cada
 * render.
 *
 * La comparación es contra la fecha LOCAL (ver `fechaISOLocal`): con la fecha
 * UTC, en Argentina un plazo se mostraba como vencido desde las 21:00 del día
 * anterior.
 */
export function plazoFijoVencido(fechaVencimiento: string): boolean {
  return fechaVencimiento <= fechaISOLocal();
}
