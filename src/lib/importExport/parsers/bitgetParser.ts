import type { MovimientoImportado, ResultadoParseo } from "../universalOperation";
import type { ParserImportacion, TablaCruda } from "./baseParser";
import { leerArchivo } from "./baseParser";
import {
  buscarColumna,
  limpiarSimbolo,
  parseFecha,
  parseLado,
  parseNumeroLocale,
} from "../sanitize";

/**
 * Parser de Bitget — cripto Spot y Futuros.
 *
 * PROVISIONAL: mapeado contra los formatos documentados de Bitget. El tipo
 * (spot vs. futuros) se detecta por la presencia de columnas de apalancamiento
 * o PnL realizado (propias de futuros). Calibrar con un export real; el preview
 * lo hace trivial.
 *
 *  - Spot:    Date, Pair, Side (Buy/Sell), Price, Filled/Executed, Fee, Total
 *  - Futuros: Time, Futures, Side (Open/Close Long/Short), Avg Price, Filled,
 *             Realized PnL, Fee, Leverage
 */

const ALIAS = {
  fecha: ["date", "time", "order time", "fecha", "trade time", "ctime"],
  par: ["pair", "trading pair", "futures", "symbol", "contract", "par"],
  lado: ["side", "direction", "lado"],
  precio: ["price", "filled price", "avg price", "average price", "precio"],
  cantidad: ["filled", "executed", "amount", "filled amount", "size", "cantidad", "qty"],
  fee: ["fee", "fees", "comision", "comision total"],
  pnl: ["realized pnl", "realized p&l", "pnl", "profit", "realized profit"],
  apalancamiento: ["leverage", "apalancamiento", "lever"],
};

/** Mapeo puro (testeable en Node) de una tabla cruda de Bitget a movimientos. */
export function mapearBitget(tabla: TablaCruda): ResultadoParseo {
  const { headers, filas } = tabla;
  const idx = {
    fecha: buscarColumna(headers, ALIAS.fecha),
    par: buscarColumna(headers, ALIAS.par),
    lado: buscarColumna(headers, ALIAS.lado),
    precio: buscarColumna(headers, ALIAS.precio),
    cantidad: buscarColumna(headers, ALIAS.cantidad),
    fee: buscarColumna(headers, ALIAS.fee),
    pnl: buscarColumna(headers, ALIAS.pnl),
    apalancamiento: buscarColumna(headers, ALIAS.apalancamiento),
  };

  // Futuros si el archivo trae apalancamiento o PnL realizado.
  const esFuturos = idx.apalancamiento >= 0 || idx.pnl >= 0;
  const subTipoActivo = esFuturos ? "futuros" : "spot";

  const requeridas: [string, number][] = [
    ["Fecha", idx.fecha],
    ["Par", idx.par],
    ["Lado", idx.lado],
    ["Precio", idx.precio],
    ["Cantidad", idx.cantidad],
  ];
  const faltante = requeridas.find(([, i]) => i === -1);
  if (faltante) {
    return {
      movimientos: [],
      errores: [{ fila: 0, motivo: `No se encontró la columna "${faltante[0]}" en el archivo de Bitget.` }],
    };
  }

  const movimientos: MovimientoImportado[] = [];
  const errores: ResultadoParseo["errores"] = [];

  filas.forEach((celdas, i) => {
    const nroFila = i + 1;
    const fecha = parseFecha(celdas[idx.fecha], false);
    const lado = parseLado(celdas[idx.lado]);
    const precio = parseNumeroLocale(celdas[idx.precio]);
    const cantidad = parseNumeroLocale(celdas[idx.cantidad]);
    const activo = limpiarSimbolo(celdas[idx.par]).replace(/[/\-_]/g, "");

    if (!fecha) return void errores.push({ fila: nroFila, motivo: "Fecha inválida o vacía." });
    if (!lado) return void errores.push({ fila: nroFila, motivo: "Lado no reconocido (se esperaba Buy/Sell u Open/Close)." });
    if (precio === null || precio <= 0) return void errores.push({ fila: nroFila, motivo: "Precio inválido." });
    if (cantidad === null || cantidad <= 0) return void errores.push({ fila: nroFila, motivo: "Cantidad inválida." });
    if (!activo) return void errores.push({ fila: nroFila, motivo: "Par/símbolo vacío." });

    const mov: MovimientoImportado = {
      fecha,
      activo,
      tipoActivo: "crypto",
      subTipoActivo,
      divisa: "USDT",
      lado,
      cantidad: Math.abs(cantidad),
      precio,
      origen: "bitget",
      filaOriginal: nroFila,
    };

    if (idx.fee >= 0) {
      const fee = parseNumeroLocale(celdas[idx.fee]);
      if (fee !== null) mov.fee = Math.abs(fee);
    }
    if (idx.pnl >= 0) {
      const pnl = parseNumeroLocale(celdas[idx.pnl]);
      if (pnl !== null) mov.pnlRealizado = pnl;
    }
    if (idx.apalancamiento >= 0) {
      const apal = parseNumeroLocale(celdas[idx.apalancamiento]);
      if (apal !== null && apal > 0) mov.apalancamiento = apal;
    }

    movimientos.push(mov);
  });

  return { movimientos, errores };
}

export const bitgetParser: ParserImportacion = {
  plataforma: "bitget",
  async parse(file: File): Promise<ResultadoParseo> {
    return mapearBitget(await leerArchivo(file));
  },
};
