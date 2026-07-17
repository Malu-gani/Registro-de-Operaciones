import type { CuentaId, Trade } from "@/types/trading";
import { abrirOperacion, cerrarOperacion } from "@/lib/tradesApi";
import { costoOperacion } from "@/utils/cuentas";
import type { OperacionReconstruida } from "./fifoReconstruction";

/**
 * Alta contra saldos de las operaciones reconstruidas. Reusa la RPC
 * `abrir_operacion` (que valida fondos y ajusta el Disponible) y, para las
 * cerradas, `cerrar_operacion` (que calcula el PnL y acredita los proceeds).
 *
 * Se procesan en orden cronológico de entrada: cada operación cerrada abre y
 * cierra de inmediato, devolviendo el capital antes de la siguiente, para
 * minimizar el saldo que hace falta tener cargado.
 *
 * Si `abrir_operacion` rechaza por `FONDOS_INSUFICIENTES:<cuenta>`, esa
 * operación no se importa y se reporta la cuenta y el capital que requería.
 */

export interface FallaImport {
  activo: string;
  fecha: string;
  tipoOperacion: "long" | "short";
  motivo: string;
  cuenta?: CuentaId;
  costoRequerido?: number;
}

export interface ResultadoImportacion {
  importadas: number;
  fallidas: FallaImport[];
}

const RE_FONDOS = /FONDOS_INSUFICIENTES:(\w+)/;

export async function importarOperaciones(
  ops: OperacionReconstruida[],
  portafolioId: string
): Promise<ResultadoImportacion> {
  const ordenadas = [...ops].sort((a, b) =>
    a.fechaEntrada.localeCompare(b.fechaEntrada)
  );

  let importadas = 0;
  const fallidas: FallaImport[] = [];

  for (const op of ordenadas) {
    const tradeInput: Omit<Trade, "id" | "portafolioId"> = {
      activo: op.activo,
      tipoActivo: op.tipoActivo,
      subTipoActivo: op.subTipoActivo,
      divisa: op.divisa,
      apalancamiento: op.apalancamiento,
      tipoOperacion: op.tipoOperacion,
      fechaEntrada: op.fechaEntrada,
      precioEntrada: op.precioEntrada,
      cantidad: op.cantidad,
      estado: "abierta",
    };

    try {
      const creada = await abrirOperacion(tradeInput, portafolioId);

      if (op.estado === "cerrada" && op.fechaSalida && op.precioSalida !== undefined) {
        await cerrarOperacion(creada.id, {
          precioSalida: op.precioSalida,
          fechaSalida: op.fechaSalida,
          cantidadCerrada: op.cantidad,
        });
      }
      importadas++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const falla: FallaImport = {
        activo: op.activo,
        fecha: op.fechaEntrada,
        tipoOperacion: op.tipoOperacion,
        motivo: msg,
      };
      const match = msg.match(RE_FONDOS);
      if (match) {
        falla.cuenta = match[1] as CuentaId;
        falla.costoRequerido = costoOperacion(tradeInput as Trade);
        falla.motivo = `Fondos insuficientes en la cuenta ${match[1]}.`;
      }
      fallidas.push(falla);
    }
  }

  return { importadas, fallidas };
}

/** Agrupa el capital faltante por cuenta (suma de los costos requeridos). */
export function faltantePorCuenta(fallidas: FallaImport[]): Partial<Record<CuentaId, number>> {
  const total: Partial<Record<CuentaId, number>> = {};
  for (const f of fallidas) {
    if (!f.cuenta || f.costoRequerido === undefined) continue;
    total[f.cuenta] = (total[f.cuenta] ?? 0) + f.costoRequerido;
  }
  return total;
}
