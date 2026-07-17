import type { PlataformaImport } from "../universalOperation";
import type { ParserImportacion } from "./baseParser";
import { iolParser } from "./iolParser";
import { bitgetParser } from "./bitgetParser";

/** Registro de parsers disponibles, indexado por plataforma. */
export const PARSERS: Partial<Record<PlataformaImport, ParserImportacion>> = {
  iol: iolParser,
  bitget: bitgetParser,
};

/** Opciones para el selector de plataforma en el panel de importación. */
export const PLATAFORMAS_IMPORT: { id: PlataformaImport; label: string }[] = [
  { id: "iol", label: "Invertir Online (acciones / CEDEARs)" },
  { id: "bitget", label: "Bitget (cripto spot / futuros)" },
];
