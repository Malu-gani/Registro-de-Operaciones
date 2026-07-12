/**
 * Búsqueda y precios de mercado en vivo.
 * Cripto: CoinGecko (sin API key). Acciones: buscador y quotes de Yahoo Finance
 * (endpoints públicos no oficiales, sin API key).
 */

export interface AssetSearchResult {
  /** Identificador para pedir el precio: id de CoinGecko para cripto, ticker para acciones. */
  id: string;
  symbol: string;
  name: string;
  type: "crypto" | "stock";
}

const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0" };

export async function searchAssets(
  query: string,
  tipo?: "crypto" | "stock",
  mercado?: "cedear" | "usd"
): Promise<AssetSearchResult[]> {
  if (tipo === "crypto") return searchCrypto(query);
  if (tipo === "stock") return searchStocks(query, mercado);

  const [crypto, stocks] = await Promise.all([
    searchCrypto(query),
    searchStocks(query, mercado),
  ]);
  return [...crypto, ...stocks];
}

async function searchCrypto(query: string): Promise<AssetSearchResult[]> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.coins ?? []).slice(0, 6).map(
      (c: { id: string; symbol: string; name: string }) => ({
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        type: "crypto" as const,
      })
    );
  } catch {
    return [];
  }
}

async function searchStocks(
  query: string,
  mercado?: "cedear" | "usd"
): Promise<AssetSearchResult[]> {
  try {
    // CEDEARs cotizan en BYMA con el sufijo ".BA" en Yahoo Finance. Buscar
    // directamente "TICKER.BA" trae el resultado correcto de una, en vez de
    // depender de que el buscador genérico lo devuelva mezclado con la
    // acción original en USD.
    const q = mercado === "cedear" && !query.toUpperCase().endsWith(".BA")
      ? `${query}.BA`
      : query;

    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
        q
      )}&quotesCount=6&newsCount=0`,
      { headers: YAHOO_HEADERS, next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    let quotes = (data.quotes ?? []).filter(
      (quote: { quoteType?: string; symbol?: string }) =>
        quote.quoteType === "EQUITY" && quote.symbol
    );

    // Filtro final por sufijo ".BA": si el usuario eligió CEDEAR, no
    // mostrar la acción original en USD (y viceversa), aunque Yahoo haya
    // devuelto ambas para la misma búsqueda.
    if (mercado === "cedear") {
      quotes = quotes.filter((quote: { symbol: string }) =>
        quote.symbol.toUpperCase().endsWith(".BA")
      );
    } else if (mercado === "usd") {
      quotes = quotes.filter(
        (quote: { symbol: string }) => !quote.symbol.toUpperCase().endsWith(".BA")
      );
    }

    return quotes
      .slice(0, 6)
      .map(
        (quote: { symbol: string; shortname?: string; longname?: string }) => ({
          id: quote.symbol,
          symbol: quote.symbol,
          name: quote.shortname ?? quote.longname ?? quote.symbol,
          type: "stock" as const,
        })
      );
  } catch {
    return [];
  }
}

export interface AssetPrice {
  price: number;
  currency: string;
}

export async function getAssetPrice(
  id: string,
  type: "crypto" | "stock"
): Promise<AssetPrice | null> {
  try {
    if (type === "crypto") {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
          id
        )}&vs_currencies=usd`,
        { cache: "no-store" }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const price = data[id]?.usd;
      return typeof price === "number" ? { price, currency: "USD" } : null;
    }

    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        id
      )}`,
      { headers: YAHOO_HEADERS, cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== "number") return null;
    return { price, currency: meta?.currency ?? "USD" };
  } catch {
    return null;
  }
}
