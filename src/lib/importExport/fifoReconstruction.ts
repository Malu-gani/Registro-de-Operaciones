import type {
  Divisa,
  SubTipoAccion,
  SubTipoCrypto,
  TipoActivo,
} from "@/types/trading";
import type { MovimientoImportado } from "./universalOperation";

/**
 * Reconstrucción de operaciones a partir de ejecuciones sueltas (FIFO).
 *
 * Las plataformas exportan una fila por compra/venta; la app modela operaciones
 * cerradas (entrada + salida). Este módulo empareja, por activo, cada cierre con
 * las aperturas más viejas (primera que entra, primera que sale) y arma la
 * operación cerrada con su PnL estimado. Lo que queda sin par al final es una
 * posición abierta.
 *
 * Modelo de inventario con signo: `compra` = +1, `venta` = -1. Mientras el
 * inventario tiene un signo, las ejecuciones del mismo signo AMPLÍAN la posición
 * y las del signo opuesto la CIERRAN (FIFO). Esto cubre tanto longs
 * (compra→venta) como shorts (venta→compra), y las vueltas de posición.
 *
 * El `pnlEstimado` es solo para la previsualización; el PnL definitivo lo calcula
 * el servidor al cerrar la operación (misma lógica que el resto de la app).
 */

export interface OperacionReconstruida {
  activo: string;
  tipoActivo: TipoActivo;
  subTipoActivo?: SubTipoAccion | SubTipoCrypto;
  divisa: Divisa;
  apalancamiento?: number;
  tipoOperacion: "long" | "short";
  fechaEntrada: string;
  precioEntrada: number;
  cantidad: number;
  estado: "abierta" | "cerrada";
  fechaSalida?: string;
  precioSalida?: number;
  /** Solo para el preview; el real lo calcula el servidor al cerrar. */
  pnlEstimado?: number;
  /** Filas del archivo original que originaron esta operación (trazabilidad). */
  filasOrigen: number[];
}

const EPS = 1e-9;

interface Lote {
  signo: 1 | -1;
  cantidad: number;
  precio: number;
  fecha: string;
  apalancamiento?: number;
  fila: number;
}

/** Clave de "libro": operaciones del mismo activo/subtipo/divisa se emparejan entre sí. */
function claveLibro(m: MovimientoImportado): string {
  return `${m.activo}|${m.subTipoActivo ?? ""}|${m.divisa}`;
}

export function reconstruirFIFO(movs: MovimientoImportado[]): OperacionReconstruida[] {
  const libros = new Map<string, MovimientoImportado[]>();
  for (const m of movs) {
    const k = claveLibro(m);
    const lista = libros.get(k);
    if (lista) lista.push(m);
    else libros.set(k, [m]);
  }

  const ops: OperacionReconstruida[] = [];
  for (const lista of libros.values()) {
    ops.push(...reconstruirLibro(lista));
  }
  ops.sort((a, b) => a.fechaEntrada.localeCompare(b.fechaEntrada));
  return ops;
}

function reconstruirLibro(movs: MovimientoImportado[]): OperacionReconstruida[] {
  const ref = movs[0];
  const ordenados = [...movs].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.filaOriginal - b.filaOriginal
  );

  const cola: Lote[] = [];
  const ops: OperacionReconstruida[] = [];

  for (const m of ordenados) {
    const signo: 1 | -1 = m.lado === "compra" ? 1 : -1;
    let restante = m.cantidad;
    const signoInventario = cola.length > 0 ? cola[0].signo : 0;

    // Inventario vacío o del mismo signo: amplía la posición.
    if (signoInventario === 0 || signoInventario === signo) {
      cola.push({
        signo,
        cantidad: restante,
        precio: m.precio,
        fecha: m.fecha,
        apalancamiento: m.apalancamiento,
        fila: m.filaOriginal,
      });
      continue;
    }

    // Signo opuesto: cierra contra los lotes más viejos (FIFO).
    while (restante > EPS && cola.length > 0 && cola[0].signo !== signo) {
      const lote = cola[0];
      const match = Math.min(restante, lote.cantidad);
      const tipoOperacion = lote.signo === 1 ? "long" : "short";
      const pnl =
        lote.signo === 1
          ? (m.precio - lote.precio) * match
          : (lote.precio - m.precio) * match;

      ops.push({
        activo: ref.activo,
        tipoActivo: ref.tipoActivo,
        subTipoActivo: ref.subTipoActivo,
        divisa: ref.divisa,
        apalancamiento: lote.apalancamiento,
        tipoOperacion,
        fechaEntrada: lote.fecha,
        precioEntrada: lote.precio,
        cantidad: match,
        estado: "cerrada",
        fechaSalida: m.fecha,
        precioSalida: m.precio,
        pnlEstimado: pnl,
        filasOrigen: [lote.fila, m.filaOriginal],
      });

      lote.cantidad -= match;
      restante -= match;
      if (lote.cantidad <= EPS) cola.shift();
    }

    // Sobrante: abre una posición nueva en la dirección de esta ejecución.
    if (restante > EPS) {
      cola.push({
        signo,
        cantidad: restante,
        precio: m.precio,
        fecha: m.fecha,
        apalancamiento: m.apalancamiento,
        fila: m.filaOriginal,
      });
    }
  }

  // Lo que quede en la cola son posiciones abiertas.
  for (const lote of cola) {
    ops.push({
      activo: ref.activo,
      tipoActivo: ref.tipoActivo,
      subTipoActivo: ref.subTipoActivo,
      divisa: ref.divisa,
      apalancamiento: lote.apalancamiento,
      tipoOperacion: lote.signo === 1 ? "long" : "short",
      fechaEntrada: lote.fecha,
      precioEntrada: lote.precio,
      cantidad: lote.cantidad,
      estado: "abierta",
      filasOrigen: [lote.fila],
    });
  }

  return ops;
}
