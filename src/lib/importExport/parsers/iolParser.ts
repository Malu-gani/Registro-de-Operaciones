import type { MovimientoImportado, ResultadoParseo } from "../universalOperation";
import type { CampoImport, IndicesColumnas, ParserImportacion, TablaCruda } from "./baseParser";
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
 * Símbolo, Operación, Cantidad, Precio). El mapeo es por NOMBRE de columna con
 * alias, no por posición; si la autodetección falla, la UI permite asignar las
 * columnas a mano (mapeo manual).
 *
 * IOL no distingue explícitamente CEDEAR vs. acción USD: se infiere del mercado
 * (BCBA/Merval -> CEDEAR en ARS; NYSE/NASDAQ/exterior -> acción en USD). Es una
 * heurística; ante la duda cae en CEDEAR/ARS.
 */

const ALIAS: Record<string, string[]> = {
  fecha: ["fecha", "fecha operacion", "fecha concertacion", "date"],
  mercado: ["mercado", "plaza"],
  simbolo: ["simbolo", "especie", "ticker", "activo", "instrumento"],
  operacion: ["operacion", "tipo", "movimiento", "tipo operacion"],
  cantidad: ["cantidad", "nominales", "cantidad nominal", "q"],
  precio: ["precio", "precio promedio", "precio unitario", "precio ponderado"],
};

const CAMPOS: CampoImport[] = [
  { id: "fecha", label: "Fecha", requerido: true },
  { id: "simbolo", label: "Símbolo", requerido: true },
  { id: "operacion", label: "Operación (Compra/Venta)", requerido: true },
  { id: "cantidad", label: "Cantidad", requerido: true },
  { id: "precio", label: "Precio", requerido: true },
  { id: "mercado", label: "Mercado (para CEDEAR vs USD)", requerido: false },
];

const MERCADOS_USD = ["nyse", "nasdaq", "eeuu", "exterior", "us", "usa"];

function inferirSubtipo(mercado: string): { subTipo: "usd" | "cedear"; divisa: "USD" | "ARS" } {
  const m = mercado.toLowerCase();
  if (MERCADOS_USD.some((k) => m.includes(k))) {
    return { subTipo: "usd", divisa: "USD" };
  }
  return { subTipo: "cedear", divisa: "ARS" };
}

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

  const movimientos: MovimientoImportado[] = [];
  const errores: ResultadoParseo["errores"] = [];

  tabla.filas.forEach((celdas, i) => {
    const nroFila = i + 1;
    const fecha = parseFecha(celdas[idx.fecha], true);
    const lado = parseLado(celdas[idx.operacion]);
    // es-AR: IOL exporta con formato argentino, así que un punto solo es
    // separador de miles ("1.234" son mil doscientos treinta y cuatro pesos).
    const cantidad = parseNumeroLocale(celdas[idx.cantidad], "es-AR");
    const precio = parseNumeroLocale(celdas[idx.precio], "es-AR");
    const activo = limpiarSimbolo(celdas[idx.simbolo]);

    if (!fecha) return void errores.push({ fila: nroFila, motivo: "Fecha inválida o vacía." });
    if (!lado) return void errores.push({ fila: nroFila, motivo: "Operación no reconocida (se esperaba Compra/Venta)." });
    if (cantidad === null || cantidad <= 0) return void errores.push({ fila: nroFila, motivo: "Cantidad inválida." });
    if (precio === null || precio <= 0) return void errores.push({ fila: nroFila, motivo: "Precio inválido." });
    if (!activo) return void errores.push({ fila: nroFila, motivo: "Símbolo vacío." });

    const mercado = (idx.mercado ?? -1) >= 0 ? celdas[idx.mercado] ?? "" : "";
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
  campos: CAMPOS,
  detectar,
  mapear,
  async parse(file: File): Promise<ResultadoParseo> {
    return mapear(await leerArchivo(file));
  },
};

/** Export directo para tests en Node. */
export const mapearIol = mapear;
