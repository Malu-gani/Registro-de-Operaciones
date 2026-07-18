import type { ErrorFila, PlataformaImport, ResultadoParseo } from "../universalOperation";
import type { OperacionReconstruida } from "../fifoReconstruction";

/**
 * Capa de Estrategia. Cada plataforma implementa `ParserImportacion`. Se separa
 * la LECTURA del archivo (browser: papaparse/SheetJS) del MAPEO de columnas
 * (`mapear`, función pura sobre una `TablaCruda`), para poder testear el mapeo
 * en Node sin la API `File` del navegador.
 */

/** Tabla genérica ya leída: encabezados + filas como celdas de texto. */
export interface TablaCruda {
  headers: string[];
  filas: string[][];
}

/** Campo lógico que el parser necesita mapear a una columna del archivo. */
export interface CampoImport {
  id: string;
  label: string;
  requerido: boolean;
}

/** Mapa campo lógico -> índice de columna en el archivo (-1 si sin asignar). */
export type IndicesColumnas = Record<string, number>;

/**
 * Resultado de un parser que emite operaciones YA reconstruidas (redondas), sin
 * pasar por FIFO. Es el caso del formato propio: el archivo exportado por el
 * diario ya trae la operación completa (estado + entrada/salida), no ejecuciones
 * sueltas. `ignoradas` cuenta filas que no son operaciones (p. ej. plazos fijos)
 * y se descartan sin marcarlas como error.
 */
export interface ResultadoParseoOperaciones {
  operaciones: OperacionReconstruida[];
  errores: ErrorFila[];
  ignoradas?: number;
}

export interface ParserImportacion {
  plataforma: PlataformaImport;
  /** Campos lógicos que el parser mapea (para la UI de mapeo manual). */
  campos: CampoImport[];
  /**
   * true = el parser emite operaciones redondas vía `mapearOperaciones` y NO
   * deben pasar por FIFO. Los parsers de ejecuciones sueltas (iol/bitget) lo
   * dejan sin definir.
   */
  sinFifo?: boolean;
  /** Detecta automáticamente los índices de columna por alias de encabezado. */
  detectar(headers: string[]): IndicesColumnas;
  /**
   * Mapea la tabla a movimientos. Si se pasan `indices` (mapeo manual del
   * usuario), los usa; si no, autodetecta desde los encabezados.
   */
  mapear(tabla: TablaCruda, indices?: IndicesColumnas): ResultadoParseo;
  /** Solo parsers con `sinFifo`: mapea la tabla a operaciones ya reconstruidas. */
  mapearOperaciones?(tabla: TablaCruda, indices?: IndicesColumnas): ResultadoParseoOperaciones;
  /** Conveniencia: lee el archivo, autodetecta y mapea. */
  parse(file: File): Promise<ResultadoParseo>;
}

/**
 * Lee un `File` a `TablaCruda`. Detecta CSV vs. Excel por extensión/nombre.
 * CSV con papaparse (autodetección de separador); Excel con SheetJS (import
 * dinámico). Solo corre en el navegador.
 */
export async function leerArchivo(file: File): Promise<TablaCruda> {
  const nombre = file.name.toLowerCase();
  const esExcel = nombre.endsWith(".xlsx") || nombre.endsWith(".xls");
  return esExcel ? leerExcel(file) : leerCsv(file);
}

async function leerCsv(file: File): Promise<TablaCruda> {
  const Papa = (await import("papaparse")).default;
  const texto = await file.text();
  const { data } = Papa.parse<string[]>(texto, {
    skipEmptyLines: true,
  });
  return filasATabla(data as string[][]);
}

async function leerExcel(file: File): Promise<TablaCruda> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const libro = XLSX.read(buf, { type: "array" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json<string[]>(hoja, {
    header: 1,
    raw: false,
    defval: "",
  });
  return filasATabla(matriz as unknown as string[][]);
}

/** Primera fila = encabezados; el resto, datos. */
function filasATabla(matriz: string[][]): TablaCruda {
  if (matriz.length === 0) return { headers: [], filas: [] };
  const [headers, ...filas] = matriz;
  return { headers: headers.map((h) => String(h ?? "")), filas };
}
