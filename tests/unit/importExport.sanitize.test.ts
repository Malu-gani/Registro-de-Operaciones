import { describe, expect, test } from "vitest";
import {
  buscarColumna,
  limpiarSimbolo,
  normalizarHeader,
  parseFecha,
  parseLado,
  parseNumeroLocale,
  simboloBaseCripto,
} from "@/lib/importExport/sanitize";

describe("normalizarHeader y buscarColumna", () => {
  test("saca acentos, espacios y mayúsculas", () => {
    expect(normalizarHeader("  Descripción  ")).toBe("descripcion");
  });

  test("encuentra la columna por cualquiera de sus alias", () => {
    expect(buscarColumna(["Fecha", "Símbolo", "Cantidad"], ["ticker", "simbolo"])).toBe(1);
  });

  test("devuelve -1 si ningún alias coincide", () => {
    expect(buscarColumna(["Fecha", "Monto"], ["ticker"])).toBe(-1);
  });
});

describe("parseNumeroLocale — formatos que ya funcionan", () => {
  test.each([
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["1234,56", 1234.56],
    ["1234.56", 1234.56],
    ["1234", 1234],
    ["$ 1.234,56", 1234.56],
    ["-500,25", -500.25],
    ["1.234.567,89", 1234567.89],
  ])("interpreta %s como %f", (entrada, esperado) => {
    expect(parseNumeroLocale(entrada)).toBeCloseTo(esperado, 6);
  });

  test.each([["", null], ["   ", null], ["-", null], ["abc", null]])(
    "%s devuelve null",
    (entrada, esperado) => {
      expect(parseNumeroLocale(entrada as string)).toBe(esperado);
    }
  );

  test("un número ya tipado se devuelve tal cual", () => {
    expect(parseNumeroLocale(42.5)).toBe(42.5);
  });

  test("NaN devuelve null", () => {
    expect(parseNumeroLocale(Number.NaN)).toBeNull();
  });
});

// Defecto 9.6 del spec. Decisión del dueño del repo (2026-07-29): en un archivo
// es-AR, "1.234" es mil doscientos treinta y cuatro. La regla se aplica por
// locale para no romper precios cripto de tres decimales en archivos en-US.
describe("parseNumeroLocale — regla de separador de miles por locale", () => {
  test("en es-AR, 1.234 es mil doscientos treinta y cuatro", () => {
    expect(parseNumeroLocale("1.234", "es-AR")).toBe(1234);
  });

  test("en es-AR, varios grupos de miles también se juntan", () => {
    expect(parseNumeroLocale("1.234.567", "es-AR")).toBe(1234567);
  });

  // Guarda contra el riesgo del arreglo: una parte entera en cero nunca es
  // miles, y sí es la forma de una cantidad cripto.
  test("en es-AR, 0.003 sigue siendo decimal", () => {
    expect(parseNumeroLocale("0.003", "es-AR")).toBeCloseTo(0.003, 6);
  });

  // Test de guarda (no de defecto): la regla de 9.6 solo aplica con exactamente
  // tres dígitos después del punto, así que este caso ya se comporta bien hoy y
  // debe seguir pasando incluso después de implementar el arreglo de 9.6.
  test("en es-AR, 1.5 sigue siendo decimal (menos de tres dígitos)", () => {
    expect(parseNumeroLocale("1.5", "es-AR")).toBe(1.5);
  });

  // Test de guarda (no de defecto): mismo motivo que el anterior, pero con más
  // de tres dígitos después del punto.
  test("en es-AR, 1.2345 sigue siendo decimal (más de tres dígitos)", () => {
    expect(parseNumeroLocale("1.2345", "es-AR")).toBeCloseTo(1.2345, 6);
  });

  test("en en-US, 1.234 sigue siendo un decimal", () => {
    expect(parseNumeroLocale("1.234", "en-US")).toBeCloseTo(1.234, 6);
  });

  test("sin locale explícito se comporta como en-US", () => {
    expect(parseNumeroLocale("1.234")).toBeCloseTo(1.234, 6);
  });
});

describe("parseFecha", () => {
  test.each([
    ["2026-07-01", "2026-07-01"],
    ["2026-07-01 12:30:00", "2026-07-01"],
    ["2026-07-01T12:30:00Z", "2026-07-01"],
    ["01/07/2026", "2026-07-01"],
    ["1/7/2026", "2026-07-01"],
    ["01-07-2026", "2026-07-01"],
    ["01/07/26", "2026-07-01"],
  ])("interpreta %s como %s", (entrada, esperado) => {
    expect(parseFecha(entrada)).toBe(esperado);
  });

  test("con diaPrimero=false interpreta mm/dd/yyyy", () => {
    expect(parseFecha("07/01/2026", false)).toBe("2026-07-01");
  });

  test.each([["", null], ["no es fecha", null], ["13/13/2026", null]])(
    "%s devuelve null",
    (entrada, esperado) => {
      expect(parseFecha(entrada)).toBe(esperado);
    }
  );

  // Defecto 9.7 del spec, ARREGLADO: validaba rangos pero no el calendario, así
  // que devolvía una fecha inexistente que Postgres rechazaba después con un
  // error crudo, en medio de la importación.
  test("una fecha inexistente devuelve null en vez de 2026-02-31", () => {
    expect(parseFecha("31/02/2026")).toBeNull();
  });

  test.each([
    ["31/04/2026", null], // abril tiene 30
    ["29/02/2025", null], // 2025 no es bisiesto
  ])("%s no existe y devuelve null", (entrada, esperado) => {
    expect(parseFecha(entrada)).toBe(esperado);
  });

  test("el 29 de febrero de un año bisiesto sí existe", () => {
    expect(parseFecha("29/02/2028")).toBe("2028-02-29");
  });
});

describe("limpiarSimbolo y simboloBaseCripto", () => {
  test("limpia espacios y pasa a mayúsculas", () => {
    expect(limpiarSimbolo("  aapl ")).toBe("AAPL");
  });

  test.each([
    ["BTC/USDT", "BTC"],
    ["BTC-USDT", "BTC"],
    ["BTC_USDT", "BTC"],
    ["BTCUSDT", "BTC"],
    ["SOLUSDT", "SOL"],
    ["BTCUSD", "BTC"],
    ["ETHBTC", "ETH"],
    ["BTC", "BTC"],
  ])("extrae la base de %s como %s", (par, esperado) => {
    expect(simboloBaseCripto(par)).toBe(esperado);
  });

  test("un valor vacío devuelve cadena vacía", () => {
    expect(simboloBaseCripto("")).toBe("");
  });
});

describe("parseLado", () => {
  test.each(["buy", "Compra", "COMPRAR", "long", "open long", "close short"])(
    "%s es compra",
    (valor) => {
      expect(parseLado(valor)).toBe("compra");
    }
  );

  test.each(["sell", "Venta", "VENDER", "short", "open short", "close long"])(
    "%s es venta",
    (valor) => {
      expect(parseLado(valor)).toBe("venta");
    }
  );

  test("un valor no reconocido devuelve null", () => {
    expect(parseLado("transferencia")).toBeNull();
  });
});
