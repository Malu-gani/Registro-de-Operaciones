import type { Divisa, SubTipoAccion, SubTipoCrypto, TipoActivo } from "@/types/trading";
import type { ErrorFila, ResultadoParseo } from "../universalOperation";
import type { OperacionReconstruida } from "../fifoReconstruction";
import type {
  CampoImport,
  IndicesColumnas,
  ParserImportacion,
  ResultadoParseoOperaciones,
  TablaCruda,
} from "./baseParser";
import { leerArchivo } from "./baseParser";
import {
  buscarColumna,
  limpiarSimbolo,
  normalizarHeader,
  parseFecha,
  parseNumeroLocale,
} from "../sanitize";

/**
 * Parser del "formato propio": re-importa el archivo que exporta el propio
 * diario (columnas de `EXPORT_HEADERS`). A diferencia de IOL/Bitget, estas
 * filas YA son operaciones redondas (estado + entrada/salida), así que NO pasan
 * por FIFO: se dan de alta tal cual (`sinFifo: true` + `mapearOperaciones`).
 *
 * Limitaciones heredadas del pipeline de alta: no se re-cargan Stop Loss, Take
 * Profit, R:R, % Riesgo ni Notas (el alta contra saldos no los recibe), igual
 * que en las importaciones de broker. Las filas de plazos fijos (u otras que no
 * sean operaciones) se ignoran, no se importan.
 */

const ALIAS: Record<string, string[]> = {
  fechaEntrada: ["fecha entrada"],
  activo: ["activo"],
  tipoActivo: ["tipo activo"],
  operacion: ["operacion"],
  cantidad: ["cantidad"],
  precioEntrada: ["precio entrada"],
  estado: ["estado"],
  fechaSalida: ["fecha salida"],
  precioSalida: ["precio salida"],
  subTipo: ["sub tipo"],
  divisa: ["divisa"],
  apalancamiento: ["apalancamiento"],
  pnl: ["pnl"],
};

const CAMPOS: CampoImport[] = [
  { id: "fechaEntrada", label: "Fecha entrada", requerido: true },
  { id: "activo", label: "Activo", requerido: true },
  { id: "tipoActivo", label: "Tipo activo (acciones/crypto)", requerido: true },
  { id: "operacion", label: "Operación (long/short)", requerido: true },
  { id: "cantidad", label: "Cantidad", requerido: true },
  { id: "precioEntrada", label: "Precio entrada", requerido: true },
  { id: "estado", label: "Estado (abierta/cerrada)", requerido: true },
  { id: "fechaSalida", label: "Fecha salida", requerido: false },
  { id: "precioSalida", label: "Precio salida", requerido: false },
  { id: "subTipo", label: "Sub tipo", requerido: false },
  { id: "divisa", label: "Divisa", requerido: false },
  { id: "apalancamiento", label: "Apalancamiento", requerido: false },
  { id: "pnl", label: "PnL", requerido: false },
];

function parseTipoOperacion(v: string | undefined): "long" | "short" | null {
  const n = normalizarHeader(v ?? "");
  if (n === "long") return "long";
  if (n === "short") return "short";
  return null;
}

function parseTipoActivo(v: string | undefined): TipoActivo | null {
  const n = normalizarHeader(v ?? "");
  if (n === "acciones") return "acciones";
  if (n === "crypto") return "crypto";
  return null;
}

function parseEstado(v: string | undefined): "abierta" | "cerrada" | null {
  const n = normalizarHeader(v ?? "");
  if (n === "abierta") return "abierta";
  if (n === "cerrada") return "cerrada";
  return null;
}

function parseDivisa(v: string | undefined): Divisa | null {
  const n = normalizarHeader(v ?? "").toUpperCase();
  if (n === "USD" || n === "ARS" || n === "USDT") return n as Divisa;
  return null;
}

/**
 * Interpreta el sub tipo validando coherencia con el tipo de activo. Vacío es
 * válido (undefined); un valor que no corresponde al tipo devuelve `error`.
 */
function parseSubTipo(
  v: string | undefined,
  tipoActivo: TipoActivo
): { subTipo?: SubTipoAccion | SubTipoCrypto; error?: boolean } {
  const n = normalizarHeader(v ?? "");
  if (n === "") return {};
  if (tipoActivo === "acciones") {
    if (n === "usd" || n === "cedear") return { subTipo: n as SubTipoAccion };
    return { error: true };
  }
  if (n === "spot" || n === "futuros") return { subTipo: n as SubTipoCrypto };
  return { error: true };
}

/** Divisa por defecto si el archivo no la trae: crypto→USDT, acciones según subtipo. */
function inferirDivisa(tipoActivo: TipoActivo, subTipo?: SubTipoAccion | SubTipoCrypto): Divisa {
  if (tipoActivo === "crypto") return "USDT";
  return subTipo === "usd" ? "USD" : "ARS";
}

function detectar(headers: string[]): IndicesColumnas {
  const idx: IndicesColumnas = {};
  for (const campo of CAMPOS) {
    idx[campo.id] = buscarColumna(headers, ALIAS[campo.id]);
  }
  return idx;
}

function mapearOperaciones(tabla: TablaCruda, indices?: IndicesColumnas): ResultadoParseoOperaciones {
  const idx = indices ?? detectar(tabla.headers);

  const faltante = CAMPOS.find((c) => c.requerido && (idx[c.id] ?? -1) < 0);
  if (faltante) {
    return {
      operaciones: [],
      errores: [{ fila: 0, motivo: `Falta asignar la columna "${faltante.label}".` }],
      ignoradas: 0,
    };
  }

  const operaciones: OperacionReconstruida[] = [];
  const errores: ErrorFila[] = [];
  let ignoradas = 0;

  tabla.filas.forEach((celdas, i) => {
    const nroFila = i + 1;
    const cel = (id: string) => ((idx[id] ?? -1) >= 0 ? celdas[idx[id]] : undefined);

    const tipoActivo = parseTipoActivo(cel("tipoActivo"));
    // Filas que no son operaciones (plazos fijos, basura, headers de otra hoja).
    if (!tipoActivo) {
      ignoradas++;
      return;
    }

    const fechaEntrada = parseFecha(cel("fechaEntrada"));
    const activo = limpiarSimbolo(cel("activo"));
    const tipoOperacion = parseTipoOperacion(cel("operacion"));
    const cantidad = parseNumeroLocale(cel("cantidad"));
    const precioEntrada = parseNumeroLocale(cel("precioEntrada"));
    const estado = parseEstado(cel("estado"));

    if (!fechaEntrada) return void errores.push({ fila: nroFila, motivo: "Fecha de entrada inválida o vacía." });
    if (!activo) return void errores.push({ fila: nroFila, motivo: "Activo vacío." });
    if (!tipoOperacion) return void errores.push({ fila: nroFila, motivo: "Operación no reconocida (se esperaba long/short)." });
    if (cantidad === null || cantidad <= 0) return void errores.push({ fila: nroFila, motivo: "Cantidad inválida." });
    if (precioEntrada === null || precioEntrada <= 0) return void errores.push({ fila: nroFila, motivo: "Precio de entrada inválido." });
    if (!estado) return void errores.push({ fila: nroFila, motivo: "Estado no reconocido (se esperaba abierta/cerrada)." });

    const sub = parseSubTipo(cel("subTipo"), tipoActivo);
    if (sub.error) return void errores.push({ fila: nroFila, motivo: `Sub tipo incompatible con "${tipoActivo}".` });

    const divisa = parseDivisa(cel("divisa")) ?? inferirDivisa(tipoActivo, sub.subTipo);
    const apalNum = parseNumeroLocale(cel("apalancamiento"));
    const pnl = parseNumeroLocale(cel("pnl"));

    let fechaSalida: string | undefined;
    let precioSalida: number | undefined;
    if (estado === "cerrada") {
      const fs = parseFecha(cel("fechaSalida"));
      const ps = parseNumeroLocale(cel("precioSalida"));
      if (!fs || ps === null || ps <= 0) {
        return void errores.push({
          fila: nroFila,
          motivo: "Operación cerrada sin fecha o precio de salida válidos.",
        });
      }
      fechaSalida = fs;
      precioSalida = ps;
    }

    operaciones.push({
      activo,
      tipoActivo,
      subTipoActivo: sub.subTipo,
      divisa,
      apalancamiento: apalNum && apalNum > 0 ? apalNum : undefined,
      tipoOperacion,
      fechaEntrada,
      precioEntrada,
      cantidad,
      estado,
      fechaSalida,
      precioSalida,
      pnlEstimado: pnl ?? undefined,
      filasOrigen: [nroFila],
    });
  });

  return { operaciones, errores, ignoradas };
}

/** No aplica al formato propio (no produce ejecuciones sueltas); el panel usa `mapearOperaciones`. */
function mapear(): ResultadoParseo {
  return { movimientos: [], errores: [] };
}

export const propioParser: ParserImportacion = {
  plataforma: "propio",
  campos: CAMPOS,
  sinFifo: true,
  detectar,
  mapear,
  mapearOperaciones,
  async parse(file: File): Promise<ResultadoParseo> {
    await leerArchivo(file);
    return mapear();
  },
};

/** Export directo para tests en Node. */
export const mapearPropio = mapearOperaciones;
