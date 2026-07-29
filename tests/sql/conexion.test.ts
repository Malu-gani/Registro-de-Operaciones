import { describe, expect, test } from "vitest";
import { crearUsuarioDePrueba } from "../setup/usuarios";

describe("harness de Supabase local", () => {
  test("crea un usuario con su portafolio por defecto", async () => {
    const u = await crearUsuarioDePrueba();

    expect(u.userId).toBeTruthy();
    expect(u.portafolioId).toBeTruthy();

    const { data } = await u.client
      .from("portafolios")
      .select("nombre, tipo_mercado")
      .eq("id", u.portafolioId)
      .single();

    expect(data?.nombre).toBe("Mi Cuenta Principal");
    expect(data?.tipo_mercado).toBe("mixto");
  });

  test("dos usuarios de prueba son distintos entre sí", async () => {
    const [a, b] = await Promise.all([crearUsuarioDePrueba(), crearUsuarioDePrueba()]);
    expect(a.userId).not.toBe(b.userId);
    expect(a.portafolioId).not.toBe(b.portafolioId);
  });
});
