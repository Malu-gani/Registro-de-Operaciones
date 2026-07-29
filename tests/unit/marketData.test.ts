import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getAssetPrice, searchAssets } from "@/lib/marketData";

/** Respuesta de fetch armada a mano: ningún test sale a la red. */
function respuesta(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getAssetPrice — cripto (CoinGecko)", () => {
  test("devuelve el precio en USD del id pedido", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta({ bitcoin: { usd: 65000 } }));

    await expect(getAssetPrice("bitcoin", "crypto")).resolves.toEqual({
      price: 65000,
      currency: "USD",
    });
  });

  test("un id inexistente devuelve null en vez de romper", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta({}));

    await expect(getAssetPrice("moneda-que-no-existe", "crypto")).resolves.toBeNull();
  });

  test("una respuesta no-ok devuelve null", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta({}, false, 429));

    await expect(getAssetPrice("bitcoin", "crypto")).resolves.toBeNull();
  });

  test("un error de red devuelve null, no una excepción", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ETIMEDOUT"));

    await expect(getAssetPrice("bitcoin", "crypto")).resolves.toBeNull();
  });

  test("un precio que no es número devuelve null", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta({ bitcoin: { usd: "65000" } }));

    await expect(getAssetPrice("bitcoin", "crypto")).resolves.toBeNull();
  });
});

describe("getAssetPrice — acciones (Yahoo Finance)", () => {
  test("devuelve precio y moneda de la respuesta de Yahoo", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({
        chart: { result: [{ meta: { regularMarketPrice: 230.5, currency: "USD" } }] },
      })
    );

    await expect(getAssetPrice("AAPL", "stock")).resolves.toEqual({
      price: 230.5,
      currency: "USD",
    });
  });

  test("un CEDEAR devuelve la moneda ARS que informa Yahoo", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({
        chart: { result: [{ meta: { regularMarketPrice: 15000, currency: "ARS" } }] },
      })
    );

    await expect(getAssetPrice("AAPL.BA", "stock")).resolves.toEqual({
      price: 15000,
      currency: "ARS",
    });
  });

  test("sin moneda en la respuesta cae a USD", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({ chart: { result: [{ meta: { regularMarketPrice: 100 } }] } })
    );

    await expect(getAssetPrice("AAPL", "stock")).resolves.toEqual({
      price: 100,
      currency: "USD",
    });
  });

  test("una respuesta sin resultados devuelve null", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta({ chart: { result: [] } }));

    await expect(getAssetPrice("NOEXISTE", "stock")).resolves.toBeNull();
  });

  test("un 5xx devuelve null", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta({}, false, 503));

    await expect(getAssetPrice("AAPL", "stock")).resolves.toBeNull();
  });
});

describe("searchAssets", () => {
  test("con tipo crypto solo consulta CoinGecko y normaliza el símbolo", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({ coins: [{ id: "bitcoin", symbol: "btc", name: "Bitcoin" }] })
    );

    const resultados = await searchAssets("bit", "crypto");

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(resultados).toEqual([
      { id: "bitcoin", symbol: "BTC", name: "Bitcoin", type: "crypto" },
    ]);
  });

  test("con mercado cedear pide el ticker con sufijo .BA", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({
        quotes: [{ symbol: "AAPL.BA", quoteType: "EQUITY", shortname: "Apple CEDEAR" }],
      })
    );

    const resultados = await searchAssets("AAPL", "stock", "cedear");

    const urlPedida = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(urlPedida).toContain("AAPL.BA");
    expect(resultados[0].symbol).toBe("AAPL.BA");
  });

  test("con mercado usd descarta los resultados .BA", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({
        quotes: [
          { symbol: "AAPL", quoteType: "EQUITY", shortname: "Apple Inc." },
          { symbol: "AAPL.BA", quoteType: "EQUITY", shortname: "Apple CEDEAR" },
        ],
      })
    );

    const resultados = await searchAssets("AAPL", "stock", "usd");

    expect(resultados.map((r) => r.symbol)).toEqual(["AAPL"]);
  });

  test("descarta los resultados que no son acciones", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({
        quotes: [
          { symbol: "AAPL", quoteType: "EQUITY", shortname: "Apple Inc." },
          { symbol: "XYZ", quoteType: "ETF", shortname: "Un ETF" },
        ],
      })
    );

    const resultados = await searchAssets("AAPL", "stock", "usd");

    expect(resultados).toHaveLength(1);
  });

  test("un error de red devuelve lista vacía, no una excepción", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNRESET"));

    await expect(searchAssets("AAPL", "stock")).resolves.toEqual([]);
  });

  test("sin tipo consulta las dos fuentes y concatena", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        respuesta({ coins: [{ id: "bitcoin", symbol: "btc", name: "Bitcoin" }] })
      )
      .mockResolvedValueOnce(
        respuesta({ quotes: [{ symbol: "BIT", quoteType: "EQUITY", shortname: "Bit Co" }] })
      );

    const resultados = await searchAssets("bit");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(resultados.map((r) => r.type)).toEqual(["crypto", "stock"]);
  });
});
