import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Las rutas de mercado son el unico endpoint propio que sale a internet
 * (CoinGecko y Yahoo). El middleware ya frenaba a los anonimos, pero lo hacia
 * con un 307 a /login: HTML como respuesta a una llamada JSON. Estos tests
 * fijan el 401 y, sobre todo, que la guarda viva en la ruta y no dependa solo
 * del matcher del middleware.
 *
 * Se mockean las dos dependencias que no pueden correr en un test: el cliente
 * de Supabase (lee cookies del request) y marketData (sale a la red).
 */
const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/marketData", () => ({
  getAssetPrice: vi.fn(async () => ({ price: 65000, currency: "USD" })),
  searchAssets: vi.fn(async () => [
    { id: "bitcoin", symbol: "BTC", name: "Bitcoin", type: "crypto" },
  ]),
}));

const { getAssetPrice, searchAssets } = await import("@/lib/marketData");
const { GET: getPrecio } = await import("@/app/api/market/price/route");
const { GET: getBusqueda } = await import("@/app/api/market/search/route");

function sinSesion() {
  getUser.mockResolvedValue({ data: { user: null }, error: null });
}

function conSesion() {
  getUser.mockResolvedValue({
    data: { user: { id: "11111111-1111-1111-1111-111111111111" } },
    error: null,
  });
}

const pedido = (url: string) => new NextRequest(new URL(url, "http://localhost:3000"));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/market/price", () => {
  test("sin sesion responde 401", async () => {
    sinSesion();

    const res = await getPrecio(pedido("/api/market/price?id=bitcoin&type=crypto"));

    expect(res.status).toBe(401);
  });

  test("sin sesion no consulta el proveedor externo", async () => {
    sinSesion();

    await getPrecio(pedido("/api/market/price?id=bitcoin&type=crypto"));

    expect(getAssetPrice).not.toHaveBeenCalled();
  });

  test("con sesion devuelve el precio", async () => {
    conSesion();

    const res = await getPrecio(pedido("/api/market/price?id=bitcoin&type=crypto"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ price: 65000, currency: "USD" });
  });

  test("con sesion y parametros invalidos sigue devolviendo 400", async () => {
    conSesion();

    const res = await getPrecio(pedido("/api/market/price?id=bitcoin"));

    expect(res.status).toBe(400);
  });
});

describe("GET /api/market/search", () => {
  test("sin sesion responde 401", async () => {
    sinSesion();

    const res = await getBusqueda(pedido("/api/market/search?q=bitcoin"));

    expect(res.status).toBe(401);
  });

  test("sin sesion no consulta el proveedor externo", async () => {
    sinSesion();

    await getBusqueda(pedido("/api/market/search?q=bitcoin"));

    expect(searchAssets).not.toHaveBeenCalled();
  });

  test("con sesion devuelve los resultados", async () => {
    conSesion();

    const res = await getBusqueda(pedido("/api/market/search?q=bitcoin"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      results: [{ id: "bitcoin", symbol: "BTC", name: "Bitcoin", type: "crypto" }],
    });
  });
});
