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
 * Parser de Invertir Online (IOL) — acciones y CEDEARs.
 *
 * PROVISIONAL: mapeado contra las columnas documentadas (Fecha, Mercado,
 * Símbolo, Operación, Cantidad, Precio, Monto Neto). El mapeo es por NOMBRE de
 * columna con alias, no por posición, así tolera variaciones. Calibrar contra un
 * export real cuando esté disponible (el preview lo hace trivial).
 *
 * IOL no distingue explícitamente CEDEAR vs. acción USD: se infiere del mercado
 * (BCBA/Merval -> CEDEAR en ARS; NYSE/NASDAQ/exterior -> acción en USD). Es una
 * heurística; ante la duda cae en CEDEAR/ARS.
 */

const ALIAS = {
  fecha: ["fecha", "fecha operacion", "fecha concertacion", "date"],
  mercado: ["mercado", "plaza"],
  simbolo: ["simbolo", "especie", "ticker", "activo", "instrumento"],
  operacion: ["operacion", "tipo", "movimiento", "tipo operacion"],
  cantidad: ["cantidad", "nominales", "cantidad nominal", "q"],
  precio: ["precio", "precio promedio", "precio unitario", "precio ponderado"],
};

const MERCADOS_USD = ["nyse", "nasdaq", "eeuu", "exterior", "us", "usa"];

function inferirSubtipo(mercado: string): { subTipo: "usd" | "cedear"; divisa: "USD" | "ARS" } {
  const m = mercado.toLowerCase();
  if (MERCADOS_USD.some((k) => m.includes(k))) {
    return { subTipo: "usd", divisa: "USD" };
  }
  return { subTipo: "cedear", divisa: "ARS" };
}

/** Mapeo puro (testeable en Node) de una tabla cruda de IOL a movimientos. */
export function mapearIol(tabla: TablaCruda): ResultadoParseo {
  const { headers, filas } = tabla;
  const idx = {
    fecha: buscarColumna(headers, ALIAS.fecha),
    mercado: buscarColumna(headers, ALIAS.mercado),
    simbolo: buscarColumna(headers, ALIAS.simbolo),
    operacion: buscarColumna(headers, ALIAS.operacion),
    cantidad: buscarColumna(headers, ALIAS.cantidad),
    precio: buscarColumna(headers, ALIAS.precio),
  };

  const movimientos: MovimientoImportado[] = [];
  const errores: ResultadoParseo["errores"] = [];

  const requeridas: [string, number][] = [
    ["Fecha", idx.fecha],
    ["Símbolo", idx.simbolo],
    ["Operación", idx.operacion],
    ["Cantidad", idx.cantidad],
    ["Precio", idx.precio],
  ];
  const faltante = requeridas.find(([, i]) => i === -1);
  if (faltante) {
    return {
      movimientos: [],
      errores: [{ fila: 0, motivo: `No se encontró la columna "${faltante[0]}" en el archivo de IOL.` }],
    };
  }

  filas.forEach((celdas, i) => {
    const nroFila = i + 1;
    const fecha = parseFecha(celdas[idx.fecha], true);
    const lado = parseLado(celdas[idx.operacion]);
    const cantidad = parseNumeroLocale(celdas[idx.cantidad]);
    const precio = parseNumeroLocale(celdas[idx.precio]);
    const activo = limpiarSimbolo(celdas[idx.simbolo]);

    if (!fecha) return void errores.push({ fila: nroFila, motivo: "Fecha inválida o vacía." });
    if (!lado) return void errores.push({ fila: nroFila, motivo: "Operación no reconocida (se esperaba Compra/Venta)." });
    if (cantidad === null || cantidad <= 0) return void errores.push({ fila: nroFila, motivo: "Cantidad inválida." });
    if (precio === null || precio <= 0) return void errores.push({ fila: nroFila, motivo: "Precio inválido." });
    if (!activo) return void errores.push({ fila: nroFila, motivo: "Símbolo vacío." });

    const mercado = idx.mercado >= 0 ? celdas[idx.mercado] ?? "" : "";
    const { subTipo, divisa } = inferirSubtipo(mercado);

    movimientos.push({
      fecha,
      activo,
      tipoActivo: "acciones",
      subTipoActivo: subTipo,
      divisa,
      lado,
      cantidad: Math.abs(cantidad),
      precio,
      origen: "iol",
      filaOriginal: nroFila,
    });
  });

  return { movimientos, errores };
}

export const iolParser: ParserImportacion = {
  plataforma: "iol",
  async parse(file: File): Promise<ResultadoParseo> {
    return mapearIol(await leerArchivo(file));
  },
};
