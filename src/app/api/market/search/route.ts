import { NextRequest, NextResponse } from "next/server";
import { searchAssets } from "@/lib/marketData";
import { exigirSesion } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const tipoParam = req.nextUrl.searchParams.get("tipo");
  const tipo = tipoParam === "crypto" || tipoParam === "stock" ? tipoParam : undefined;

  const mercadoParam = req.nextUrl.searchParams.get("mercado");
  const mercado =
    mercadoParam === "cedear" || mercadoParam === "usd" ? mercadoParam : undefined;

  const results = await searchAssets(q, tipo, mercado);
  return NextResponse.json({ results });
}
