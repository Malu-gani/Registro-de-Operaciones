import { NextRequest, NextResponse } from "next/server";
import { getAssetPrice } from "@/lib/marketData";
import { exigirSesion } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const noAutorizado = await exigirSesion();
  if (noAutorizado) return noAutorizado;

  const id = req.nextUrl.searchParams.get("id");
  const type = req.nextUrl.searchParams.get("type");

  if (!id || (type !== "crypto" && type !== "stock")) {
    return NextResponse.json(
      { error: "Parámetros inválidos" },
      { status: 400 }
    );
  }

  const resultado = await getAssetPrice(id, type);
  if (resultado === null) {
    return NextResponse.json(
      { error: "No se pudo obtener el precio actual" },
      { status: 502 }
    );
  }

  return NextResponse.json(resultado);
}
