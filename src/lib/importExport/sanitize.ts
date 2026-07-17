/**
 * Helpers de saneamiento para la importación. Toleran los formatos "sucios" que
 * exportan las plataformas: números con separador de miles y coma decimal,
 * fechas en varios formatos, encabezados con acentos/mayúsculas variables.
 * Todas las funciones devuelven `null` cuando no pueden interpretar el valor,
 * para que el parser acumule el error de esa fila sin romper la importación.
 */

/** Normaliza un encabezado: minúsculas, sin acentos, sin espacios de más. */
export function normalizarHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

/**
 * Busca el índice de una columna por lista de alias (comparación normalizada).
 * Devuelve -1 si ninguna columna coincide. Los alias también se normalizan.
 */
export function buscarColumna(headers: string[], alias: string[]): number {
  const normHeaders = headers.map(normalizarHeader);
  const normAlias = alias.map(normalizarHeader);
  for (let i = 0; i < normHeaders.length; i++) {
    if (normAlias.includes(normHeaders[i])) return i;
  }
  return -1;
}

/**
 * Interpreta un número en formatos locales heterogéneos:
 *  - "1.234,56"  (es-AR: punto=miles, coma=decimal) -> 1234.56
 *  - "1,234.56"  (en-US: coma=miles, punto=decimal) -> 1234.56
 *  - "1234.56" / "1234,56" / "1234"                 -> 1234.56 / 1234.56 / 1234
 * Ignora símbolos de moneda, espacios y el signo se respeta. Devuelve null si
 * no queda un número válido.
 */
export function parseNumeroLocale(valor: string | number | undefined | null): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;

  let s = valor.trim();
  if (s === "") return null;
  // quitar todo lo que no sea dígito, separadores, signo
  s = s.replace(/[^0-9.,\-]/g, "");
  if (s === "" || s === "-") return null;

  const tieneComa = s.includes(",");
  const tienePunto = s.includes(".");

  if (tieneComa && tienePunto) {
    // el separador decimal es el que aparece más a la derecha
    const ultimaComa = s.lastIndexOf(",");
    const ultimoPunto = s.lastIndexOf(".");
    if (ultimaComa > ultimoPunto) {
      // formato es-AR: punto = miles, coma = decimal
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // formato en-US: coma = miles, punto = decimal
      s = s.replace(/,/g, "");
    }
  } else if (tieneComa) {
    // solo coma: tratarla como decimal (1234,56 -> 1234.56)
    s = s.replace(",", ".");
  }
  // solo punto o sin separadores: ya está en formato JS

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normaliza una fecha a YYYY-MM-DD desde formatos frecuentes:
 *  - ISO con o sin hora: "2026-07-01", "2026-07-01 12:30:00", "2026-07-01T12:30:00Z"
 *  - dd/mm/yyyy (IOL/es-AR) o mm/dd/yyyy según `diaPrimero`
 *  - dd-mm-yyyy
 * Devuelve null si no reconoce el formato o la fecha es inválida.
 */
export function parseFecha(
  valor: string | number | undefined | null,
  diaPrimero = true
): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  if (s === "") return null;

  // ISO: tomar la parte de fecha antes del espacio o la T
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return armarFecha(iso[1], iso[2], iso[3]);
  }

  // dd/mm/yyyy o mm/dd/yyyy (separador / o -)
  const dmy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
  if (dmy) {
    const a = dmy[1];
    const b = dmy[2];
    let anio = dmy[3];
    if (anio.length === 2) anio = "20" + anio;
    const dia = diaPrimero ? a : b;
    const mes = diaPrimero ? b : a;
    return armarFecha(anio, mes, dia);
  }

  return null;
}

/** Valida rangos y arma "YYYY-MM-DD" con ceros a la izquierda. Null si inválida. */
function armarFecha(anio: string, mes: string, dia: string): string | null {
  const y = Number(anio);
  const m = Number(mes);
  const d = Number(dia);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** Limpia un símbolo/ticker: mayúsculas, sin espacios ni sufijos de mercado. */
export function limpiarSimbolo(valor: string | undefined | null): string {
  if (!valor) return "";
  return valor.trim().toUpperCase().replace(/\s+/g, "");
}

/** Normaliza el lado de la ejecución a "compra" | "venta". Null si no reconoce. */
export function parseLado(valor: string | undefined | null): "compra" | "venta" | null {
  if (!valor) return null;
  const v = normalizarHeader(valor);
  if (["buy", "compra", "comprar", "long", "open long", "close short"].includes(v)) {
    return "compra";
  }
  if (["sell", "venta", "vender", "short", "open short", "close long"].includes(v)) {
    return "venta";
  }
  return null;
}
