import { createClient } from "./supabase/client";
import type { Portafolio, TipoMercadoPortafolio } from "@/types/trading";

const supabase = createClient();

interface PortafolioRow {
  id: string;
  nombre: string;
  tipo_mercado: TipoMercadoPortafolio;
  created_at: string;
}

const MENSAJE_NOMBRE_DUPLICADO = "Ya existe un portafolio con ese nombre.";

function mensajeError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return MENSAJE_NOMBRE_DUPLICADO;
  return error.message;
}

function rowToPortafolio(row: PortafolioRow): Portafolio {
  return {
    id: row.id,
    nombre: row.nombre,
    tipoMercado: row.tipo_mercado,
    createdAt: row.created_at,
  };
}

export async function fetchPortafolios(): Promise<Portafolio[]> {
  const { data, error } = await supabase
    .from("portafolios")
    .select("id, nombre, tipo_mercado, created_at")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data as PortafolioRow[]).map(rowToPortafolio);
}

export async function createPortafolio(
  nombre: string,
  tipoMercado: TipoMercadoPortafolio
): Promise<Portafolio> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("No se encontró la sesión del usuario.");
  }

  const { data, error } = await supabase
    .from("portafolios")
    .insert({ nombre, tipo_mercado: tipoMercado, user_id: user.id })
    .select("id, nombre, tipo_mercado, created_at")
    .single();

  if (error) throw new Error(mensajeError(error));

  return rowToPortafolio(data as PortafolioRow);
}

export async function renamePortafolio(
  id: string,
  nombre: string
): Promise<Portafolio> {
  const { data, error } = await supabase
    .from("portafolios")
    .update({ nombre })
    .eq("id", id)
    .select("id, nombre, tipo_mercado, created_at")
    .single();

  if (error) throw new Error(mensajeError(error));

  return rowToPortafolio(data as PortafolioRow);
}

export async function deletePortafolio(id: string): Promise<void> {
  const { error } = await supabase.from("portafolios").delete().eq("id", id);

  if (error) throw new Error(error.message);
}
