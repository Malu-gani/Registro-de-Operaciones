import { describe, expect, test } from "vitest";
import { esEmailSinConfirmar, traducirErrorAuth } from "@/utils/authErrors";

describe("traducirErrorAuth", () => {
  test("traduce 'Email not confirmed'", () => {
    expect(traducirErrorAuth("Email not confirmed")).toMatch(/confirm/i);
    expect(traducirErrorAuth("Email not confirmed")).not.toMatch(/not confirmed/);
  });

  test("traduce credenciales inválidas", () => {
    expect(traducirErrorAuth("Invalid login credentials")).toBe(
      "Email o contraseña incorrectos."
    );
  });

  test("un mensaje desconocido cae en un genérico en español", () => {
    const salida = traducirErrorAuth("some new supabase error xyz");
    expect(salida).not.toContain("xyz");
    expect(salida).toMatch(/[áéíóñ]|de nuevo|no se pudo/i);
  });
});

describe("esEmailSinConfirmar", () => {
  test("true solo para 'Email not confirmed'", () => {
    expect(esEmailSinConfirmar("Email not confirmed")).toBe(true);
    expect(esEmailSinConfirmar("Invalid login credentials")).toBe(false);
  });
});
