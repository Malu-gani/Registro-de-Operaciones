import { describe, expect, test } from "vitest";
import { rutaInternaSegura } from "@/utils/rutaSegura";

describe("rutaInternaSegura", () => {
  test("deja pasar las rutas internas que la app genera", () => {
    expect(rutaInternaSegura("/dashboard")).toBe("/dashboard");
    expect(rutaInternaSegura("/reset-password")).toBe("/reset-password");
  });

  test("deja pasar una ruta interna con query", () => {
    expect(rutaInternaSegura("/historial?filtro=abierta")).toBe(
      "/historial?filtro=abierta"
    );
  });

  test("cae al default cuando no viene el parámetro", () => {
    expect(rutaInternaSegura(null)).toBe("/dashboard");
    expect(rutaInternaSegura("")).toBe("/dashboard");
  });

  // El ataque real: con la base sin barra final,
  // "https://app.vercel.app" + "@evil.com" resuelve al host evil.com, porque
  // el dominio propio pasa a ser la parte userinfo de la URL.
  test("rechaza el arroba que convierte el dominio propio en userinfo", () => {
    expect(rutaInternaSegura("@evil.com")).toBe("/dashboard");
  });

  test("rechaza una URL absoluta a otro dominio", () => {
    expect(rutaInternaSegura("https://evil.com")).toBe("/dashboard");
    expect(rutaInternaSegura("//evil.com")).toBe("/dashboard");
  });

  test("rechaza la barra invertida, que los navegadores normalizan a //", () => {
    expect(rutaInternaSegura("/\\evil.com")).toBe("/dashboard");
    expect(rutaInternaSegura("\\\\evil.com")).toBe("/dashboard");
  });

  test("rechaza cualquier cosa que no arranque con barra", () => {
    expect(rutaInternaSegura("evil.com")).toBe("/dashboard");
    expect(rutaInternaSegura("?next=/x")).toBe("/dashboard");
    expect(rutaInternaSegura("javascript:alert(1)")).toBe("/dashboard");
  });
});
