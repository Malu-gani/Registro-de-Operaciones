import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * El action de signup reenviaba el `error.message` crudo de Supabase a la query
 * de /signup, o sea texto en ingles y detalle interno del proveedor donde el
 * resto de la app ya usa `authErrors.ts`.
 *
 * Se mockean `next/navigation` (redirect corta el flujo lanzando) y el cliente
 * de Supabase (sale a la red).
 */
const signUp = vi.fn();
const redirect = vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`);
});

vi.mock("next/navigation", () => ({ redirect }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp } }),
}));

const { signup } = await import("@/app/signup/actions");

/** Corre el action y devuelve el destino del redirect (decodificado). */
async function destinoDe(datos: Record<string, string>): Promise<string> {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(datos)) formData.set(clave, valor);

  await signup(formData).catch(() => {});

  const destino = redirect.mock.calls.at(-1)?.[0] ?? "";
  return decodeURIComponent(destino);
}

const VALIDOS = {
  email: "alguien@ejemplo.com",
  password: "Contrasena1!",
  confirmPassword: "Contrasena1!",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signup — errores de Supabase", () => {
  test("no filtra el mensaje crudo del proveedor", async () => {
    signUp.mockResolvedValue({
      error: { message: "AuthApiError: unexpected_failure at db node 7" },
    });

    const destino = await destinoDe(VALIDOS);

    expect(destino).not.toContain("AuthApiError");
    expect(destino).not.toContain("db node 7");
  });

  test("muestra un mensaje en espanol", async () => {
    signUp.mockResolvedValue({
      error: { message: "AuthApiError: unexpected_failure at db node 7" },
    });

    const destino = await destinoDe(VALIDOS);

    expect(destino).toMatch(/^\/signup\?error=/);
    expect(destino).toMatch(/no se pudo|prob[áa] de nuevo/i);
  });

  test("traduce el rate limit, que si es accionable para el usuario", async () => {
    signUp.mockResolvedValue({
      error: { message: "Email rate limit exceeded" },
    });

    const destino = await destinoDe(VALIDOS);

    expect(destino).toMatch(/esper[áa]|minutos/i);
    expect(destino).not.toContain("rate limit");
  });

  test("sin error manda a login con el aviso de confirmar el email", async () => {
    signUp.mockResolvedValue({ error: null });

    const destino = await destinoDe(VALIDOS);

    expect(destino).toMatch(/^\/login\?message=/);
    expect(destino).toMatch(/confirm/i);
  });
});
