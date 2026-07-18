import type { MovimientoImportado, ResultadoParseo } from "../universalOperation";
import type { CampoImport, IndicesColumnas, ParserImportacion, TablaCruda } from "./baseParser";
import { leerArchivo } from "./baseParser";
import {
  buscarColumna,
  parseFecha,
  parseLado,
  parseNumeroLocale,
  simboloBaseCripto,
} from "../sanitize";

/**
 * Parser de Bitget — cripto Spot y Futuros.
 *
 * PROVISIONAL: mapeado contra los formatos documentados de Bitget. El tipo
 * (spot vs. futuros) se detecta por la presencia de columnas de apalancamiento
 * o PnL realizado (propias de futuros). Si la autodetección falla, la UI permite
 * asignar las columnas a mano (mapeo manual).
 *
 *  - Spot:    Date, Pair, Side (Buy/Sell), Price, Filled/Executed, Fee, Total
 *  - Futuros: Time, Futures, Side (Open/Close Long/Short), Avg Price, Filled,
 *             Realized PnL, Fee, Leverage
 */

const ALIAS: Record<string, string[]> = {
  fecha: ["date", "time", "order time", "fecha", "trade time", "ctime"],
  par: ["pair", "trading pair", "futures", "symbol", "contract", "par"],
  lado: ["side", "direction", "lado"],
  precio: ["price", "filled price", "avg price", "average price", "precio"],
  cantidad: ["filled", "executed", "amount", "filled amount", "size", "cantidad", "qty"],
  fee: ["fee", "fees", "comision", "comision total"],
  pnl: ["realized pnl", "realized p&l", "pnl", "profit", "realized profit"],
  apalancamiento: ["leverage", "apalancamiento", "lever"],
};

const CAMPOS: CampoImport[] = [
  { id: "fecha", label: "Fecha / Time", requerido: true },
  { id: "par", label: "Par / Símbolo", requerido: true },
  { id: "lado", label: "Lado (Buy/Sell u Open/Close)", requerido: true },
  { id: "precio", label: "Precio", requerido: true },
  { id: "cantidad", label: "Cantidad ejecutada", requerido: true },
  { id: "fee", label: "Comisión (fee)", requerido: false },
  { id: "pnl", label: "PnL realizado (futuros)", requerido: false },
  { id: "apalancamiento", label: "Apalancamiento (futuros)", requerido: false },
];

function detectar(headers: string[]): IndicesColumnas {
  const idx: IndicesColumnas = {};
  for (const campo of CAMPOS) {
    idx[campo.id] = buscarColumna(headers, ALIAS[campo.id]);
  }
  return idx;
}

function mapear(tabla: TablaCruda, indices?: IndicesColumnas): ResultadoParseo {
  const idx = indices ?? detectar(tabla.headers);

  const faltante = CAMPOS.find((c) => c.requerido && (idx[c.id] ?? -1) < 0);
  if (faltante) {
    return {
      movimientos: [],
      errores: [{ fila: 0, motivo: `Falta asignar la columna "${faltante.label}".` }],
    };
  }

  // Futuros si el archivo trae apalancamiento o PnL realizado.
  const esFuturos = (idx.apalancamiento ?? -1) >= 0 || (idx.pnl ?? -1) >= 0;
  const subTipoActivo = esFuturos ? "futuros" : "spot";

  const movimientos: MovimientoImportado[] = [];
  const errores: ResultadoParseo["errores"] = [];

  tabla.filas.forEach((celdas, i) => {
    const nroFila = i + 1;
    const fecha = parseFecha(celdas[idx.fecha], false);
    const lado = parseLado(celdas[idx.lado]);
    const precio = parseNumeroLocale(celdas[idx.precio]);
    const cantidad = parseNumeroLocale(celdas[idx.cantidad]);
    const activo = simboloBaseCripto(celdas[idx.par]);

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

    if ((idx.fee ?? -1) >= 0) {
      const fee = parseNumeroLocale(celdas[idx.fee]);
      if (fee !== null) mov.fee = Math.abs(fee);
    }
    if ((idx.pnl ?? -1) >= 0) {
      const pnl = parseNumeroLocale(celdas[idx.pnl]);
      if (pnl !== null) mov.pnlRealizado = pnl;
    }
    if ((idx.apalancamiento ?? -1) >= 0) {
      const apal = parseNumeroLocale(celdas[idx.apalancamiento]);
      if (apal !== null && apal > 0) mov.apalancamiento = apal;
    }

    movimientos.push(mov);
  });

  return { movimientos, errores };
}

export const bitgetParser: ParserImportacion = {
  plataforma: "bitget",
  campos: CAMPOS,
  detectar,
  mapear,
  async parse(file: File): Promise<ResultadoParseo> {
    return mapear(await leerArchivo(file));
  },
};

/** Export directo para tests en Node. */
export const mapearBitget = mapear;
