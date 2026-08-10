import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nombreConFecha } from "@/lib/importExport/export/descargar";

describe("nombreConFecha", () => {
  // Defecto OPS-BUG-08: toISOString() convierte a UTC antes de recortar, así
  // que a partir de las 21:00 en Argentina (UTC-3) el nombre de archivo queda
  // fechado un día para adelante. Mismo patrón que el defecto 9.3 ya arreglado
  // en plazoFijoVencido (ver riskCalculations.analisis.test.ts).
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T01:00:00.000Z")); // 2026-07-28 22:00 ART
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("a las 22:00 ART usa la fecha local del día, no la fecha UTC del día siguiente", () => {
    expect(nombreConFecha("historial-operaciones", "csv")).toBe(
      "historial-operaciones-2026-07-28.csv"
    );
  });
});
