# Verificación por email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exigir confirmación de email al registrarse (con reenvío) y agregar un flujo de recuperación de contraseña, ambos probados end-to-end con el atrapa-mails local.

**Architecture:** Reusa el flujo PKCE existente (`/auth/callback` + `exchangeCodeForSession`) para los dos flujos. Dos rutas nuevas fuera del grupo `(app)`: `/forgot-password` y `/reset-password`. Los errores crudos de Supabase se traducen a español con un helper puro. Tests E2E con Playwright leyendo el atrapa-mails local (`local_smtp`, :54324).

**Tech Stack:** Next.js 16 (App Router, Server Actions) · `@supabase/ssr` · Supabase Auth (PKCE) · Vitest (unit) · Playwright (E2E) · Supabase CLI local con atrapa-mails.

**Spec:** `docs/superpowers/specs/2026-07-29-verificacion-email-design.md`

## Global Constraints

- Textos de UI y mensajes de error **en español**; ningún mensaje crudo de Supabase llega al usuario (pasa por `traducirErrorAuth`).
- **Nunca poner el email (ni otro dato personal) en query strings.** El reenvío toma el email de un campo del formulario, no de la URL.
- Reusar `validarPassword` de `src/utils/passwordPolicy.ts` para la contraseña nueva (no duplicar reglas).
- **Sin firma de Claude** en commits.
- Rutas nuevas con el mismo estilo Tailwind que `/login` y `/signup` (tarjeta centrada `max-w-sm`, sin sidebar).
- Verificación local por tarea: `npm run typecheck`, `npm run lint`, `npm test`. Los E2E (`npm run test:e2e`) necesitan Docker + `npm run db:start`.
- Node 22 en CI.

---

### Task 1: Helper puro para traducir errores de Auth

Un módulo puro que mapea los mensajes crudos de Supabase a español y detecta el caso "email sin confirmar". Se testea con Vitest (unit), sin red.

**Files:**
- Create: `src/utils/authErrors.ts`
- Test: `tests/unit/authErrors.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `traducirErrorAuth(mensaje: string): string` y `esEmailSinConfirmar(mensaje: string): boolean` — los usan las Tasks 2 (login) y 4 (reset).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/authErrors.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- authErrors`
Expected: FAIL (módulo `@/utils/authErrors` no existe).

- [ ] **Step 3: Implementar el helper**

Crear `src/utils/authErrors.ts`:

```ts
/**
 * Traduce los mensajes crudos de Supabase Auth (en inglés) a español. Cualquier
 * mensaje no mapeado cae en un genérico, así nunca llega texto en inglés al
 * usuario.
 */
export function traducirErrorAuth(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("email not confirmed")) {
    return "Todavía no confirmaste tu email. Revisá tu casilla o reenviá el correo.";
  }
  if (m.includes("invalid login credentials")) {
    return "Email o contraseña incorrectos.";
  }
  if (m.includes("rate limit")) {
    return "Demasiados intentos. Esperá unos minutos y probá de nuevo.";
  }
  if (m.includes("user already registered")) {
    return "Ya existe una cuenta con ese email.";
  }
  return "No se pudo completar la operación. Probá de nuevo.";
}

/** True si el error es específicamente "email sin confirmar". */
export function esEmailSinConfirmar(mensaje: string): boolean {
  return mensaje.toLowerCase().includes("email not confirmed");
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- authErrors`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/authErrors.ts tests/unit/authErrors.test.ts
git commit -m "feat(auth): helper para traducir errores de Supabase a español"
```

---

### Task 2: Login — traducir errores + reenviar confirmación

El login pasa a traducir el error y, cuando es "email sin confirmar", marca un flag para que la página muestre un formulario de reenvío. Nueva server action `reenviarConfirmacion`.

**Files:**
- Modify: `src/app/login/actions.ts`
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `traducirErrorAuth`, `esEmailSinConfirmar` (Task 1).
- Produces: `reenviarConfirmacion(formData: FormData)` (server action, usada por la página).

- [ ] **Step 1: Reescribir `login/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { esEmailSinConfirmar, traducirErrorAuth } from "@/utils/authErrors";

export async function login(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const params = new URLSearchParams({ error: traducirErrorAuth(error.message) });
    // Flag para que la página ofrezca el reenvío. El email NO va en la URL:
    // lo vuelve a tipear el usuario en el formulario de reenvío.
    if (esEmailSinConfirmar(error.message)) params.set("sinConfirmar", "1");
    redirect(`/login?${params.toString()}`);
  }

  redirect("/dashboard");
}

export async function reenviarConfirmacion(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(traducirErrorAuth(error.message))}`);
  }

  redirect(
    `/login?message=${encodeURIComponent(
      "Te reenviamos el correo de confirmación. Revisá tu casilla."
    )}`
  );
}
```

- [ ] **Step 2: Actualizar `login/page.tsx`**

Ampliar el tipo de `searchParams` para incluir `sinConfirmar`, importar `reenviarConfirmacion`, y debajo del bloque de `params.error` agregar el formulario de reenvío (solo cuando `sinConfirmar`), más el link a `/forgot-password` antes del link de registro:

```tsx
import Link from "next/link";
import { login, reenviarConfirmacion } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; sinConfirmar?: string }>;
}) {
  const params = await searchParams;
  // ...resto igual hasta después del bloque {params.error && (...)}:
```

Agregar, inmediatamente después del `{params.error && (...)}`:

```tsx
        {params.sinConfirmar && (
          <form action={reenviarConfirmacion} className="mb-4 flex flex-col gap-2">
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="Reingresá tu email"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            />
            <button
              type="submit"
              className="rounded-md border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand hover:text-brand-foreground"
            >
              Reenviar email de confirmación
            </button>
          </form>
        )}
```

Y antes del párrafo "¿No tiene una cuenta?" agregar:

```tsx
        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-brand underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
```

- [ ] **Step 3: Verificar typecheck + lint + tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: los tres en verde (no hay tests nuevos acá; se cubre por E2E en la Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/app/login/actions.ts src/app/login/page.tsx
git commit -m "feat(auth): login traduce errores y ofrece reenviar la confirmación"
```

---

### Task 3: Página de "olvidé mi contraseña" + rutas públicas en el middleware

Ruta `/forgot-password`: pide el email y dispara `resetPasswordForEmail`. Respuesta idéntica exista o no el email (anti-enumeración). Además se agregan `/forgot-password` y `/reset-password` a las rutas públicas del middleware (si no, las rebota a `/login`).

**Files:**
- Create: `src/app/forgot-password/page.tsx`
- Create: `src/app/forgot-password/actions.ts`
- Modify: `src/lib/supabase/middleware.ts:4`

**Interfaces:**
- Consumes: nada de otras tasks.
- Produces: la ruta `/forgot-password` y las rutas públicas que consume la Task 4.

- [ ] **Step 1: Agregar las rutas públicas en el middleware**

En `src/lib/supabase/middleware.ts`, reemplazar la línea 4:

```ts
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth/callback",
  "/forgot-password",
  "/reset-password",
];
```

- [ ] **Step 2: Crear `forgot-password/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function pedirRecuperacion(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Si falla (email inexistente, rate limit) NO se distingue del éxito: la
  // respuesta al usuario es siempre la misma, para no revelar qué emails existen.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  redirect(
    `/forgot-password?message=${encodeURIComponent(
      "Si el email está registrado, te mandamos un enlace para recuperar la contraseña."
    )}`
  );
}
```

- [ ] **Step 3: Crear `forgot-password/page.tsx`**

```tsx
import Link from "next/link";
import { pedirRecuperacion } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
        <h1 className="mb-1 text-lg font-semibold text-foreground">
          Recuperar contraseña
        </h1>
        <p className="mb-6 text-sm text-foreground-muted">
          Ingresá tu email y te mandamos un enlace para elegir una nueva.
        </p>

        {params.message && (
          <p className="mb-4 rounded-lg border border-risk-green-border bg-risk-green-bg p-3 text-sm text-risk-green">
            {params.message}
          </p>
        )}
        {params.error && (
          <p className="mb-4 rounded-lg border border-risk-red-border bg-risk-red-bg p-3 text-sm text-risk-red">
            {params.error}
          </p>
        )}

        <form action={pedirRecuperacion} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground-muted">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            Enviar enlace
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-foreground-muted">
          <Link href="/login" className="text-brand underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verificar typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: en verde.

- [ ] **Step 5: Commit**

```bash
git add src/app/forgot-password src/lib/supabase/middleware.ts
git commit -m "feat(auth): página de recuperación de contraseña (pedir enlace)"
```

---

### Task 4: Página de "nueva contraseña"

Ruta `/reset-password`: exige una sesión de recuperación activa (la deja el callback). Si no hay, redirige a `/forgot-password`. Con sesión, permite fijar la contraseña nueva con `updateUser`.

**Files:**
- Create: `src/app/reset-password/page.tsx`
- Create: `src/app/reset-password/actions.ts`

**Interfaces:**
- Consumes: `validarPassword` (`src/utils/passwordPolicy.ts`); las rutas públicas de la Task 3.
- Produces: la ruta `/reset-password` (destino del `next` del callback).

- [ ] **Step 1: Crear `reset-password/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validarPassword } from "@/utils/passwordPolicy";

export async function establecerPassword(formData: FormData) {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  const errorPolitica = validarPassword(password);
  if (errorPolitica) {
    redirect(`/reset-password?error=${encodeURIComponent(errorPolitica)}`);
  }
  if (password !== confirmPassword) {
    redirect(
      `/reset-password?error=${encodeURIComponent("Las contraseñas no coinciden.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(
      `/reset-password?error=${encodeURIComponent(
        "No se pudo actualizar la contraseña. Pedí un enlace nuevo."
      )}`
    );
  }

  redirect("/dashboard");
}
```

- [ ] **Step 2: Crear `reset-password/page.tsx`** (server component que exige sesión)

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REQUISITOS_PASSWORD_HINT } from "@/utils/passwordPolicy";
import { establecerPassword } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  // El callback dejó una sesión de recuperación. Sin ella no se puede fijar la
  // contraseña: mandamos a pedir un enlace nuevo.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(
        "El enlace venció o no es válido. Pedí uno nuevo."
      )}`
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6">
        <h1 className="mb-1 text-lg font-semibold text-foreground">
          Elegí una nueva contraseña
        </h1>
        <p className="mb-6 text-sm text-foreground-muted">
          Escribí tu contraseña nueva dos veces.
        </p>

        {params.error && (
          <p className="mb-4 rounded-lg border border-risk-red-border bg-risk-red-bg p-3 text-sm text-risk-red">
            {params.error}
          </p>
        )}

        <form action={establecerPassword} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground-muted">
              Contraseña nueva
            </span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            />
            <span className="text-xs text-foreground-muted">
              {REQUISITOS_PASSWORD_HINT}
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground-muted">
              Repetir contraseña
            </span>
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
          >
            Guardar contraseña
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: en verde.

- [ ] **Step 4: Commit**

```bash
git add src/app/reset-password
git commit -m "feat(auth): página para fijar la contraseña nueva"
```

---

### Task 5: Infra de test E2E — prender confirmación sin romper la suite

Prender `enable_confirmations` rompe los 5 E2E actuales, que hoy dependen de que `signUp` devuelva sesión al toque. Esta task prende la confirmación, ajusta puertos/redirects, agrega el helper de atrapa-mails y adapta `entrarComoUsuarioNuevo` para que confirme vía mail. Termina cuando los 5 E2E existentes vuelven a verde.

**Files:**
- Modify: `supabase/config.toml` (`[auth]` y `[auth.rate_limit]`)
- Modify: `playwright.config.ts` (env del webServer)
- Create: `tests/e2e/helpers/mail.ts`
- Modify: `tests/e2e/flujos.spec.ts` (`entrarComoUsuarioNuevo`)

**Interfaces:**
- Consumes: nada.
- Produces: `leerUltimoMail(email)` y `extraerLinkDeAuth(html)` (helpers usados por la Task 6); un `entrarComoUsuarioNuevo` que funciona con la confirmación prendida.

- [ ] **Step 1: Editar `supabase/config.toml`**

En `[auth]`: `enable_confirmations = true`. Y agregar la URL del E2E (:3100) a la allow-list de redirects (buscar `additional_redirect_urls`; si no existe la clave, agregarla dentro de `[auth]`):

```toml
enable_confirmations = true
additional_redirect_urls = ["http://127.0.0.1:3100/**", "http://127.0.0.1:3000/**"]
```

En `[auth.rate_limit]`, subir el límite de mails (hoy `email_sent = 2`), que si no tumba los E2E que disparan varios correos:

```toml
email_sent = 100
```

- [ ] **Step 2: Reiniciar Supabase local para que tome la config**

El `config.toml` se lee al arrancar los contenedores; un `db reset` no alcanza. Correr:

Run: `npx supabase stop && npm run db:start && npm run db:reset`
Expected: los contenedores levantan y las migraciones se aplican OK.

- [ ] **Step 3: Pasarle `NEXT_PUBLIC_SITE_URL` al webServer de Playwright**

En `playwright.config.ts`, en `webServer.env`, agregar la línea del site url apuntando al puerto del E2E (si no, los links de los mails apuntan a :3000 y el test corre en :3100):

```ts
    env: {
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
      NEXT_PUBLIC_SITE_URL: BASE_URL,
    },
```

- [ ] **Step 4: Confirmar la API del atrapa-mails**

El helper depende de la API del servidor de mails local. Confirmar su forma antes de escribir el helper:

Run: `curl -s http://127.0.0.1:54324/api/v1/messages`
Expected: un JSON (probablemente Mailpit: objeto con `messages: [...]`). Si devuelve 404, probar la API de Inbucket (`http://127.0.0.1:54324/api/v1/mailbox/<usuario>`) y ajustar el helper del Step 5 en consecuencia. Anotar cuál es.

- [ ] **Step 5: Crear `tests/e2e/helpers/mail.ts`** (implementación para Mailpit; ajustar si el Step 4 dio Inbucket)

```ts
const MAILPIT = "http://127.0.0.1:54324";

interface ResumenMail {
  ID: string;
}

/**
 * Devuelve el HTML del último mail recibido por `email`, reintentando unos
 * segundos porque el envío es asíncrono. Usa la API de Mailpit del atrapa-mails
 * que levanta la CLI de Supabase.
 */
export async function leerUltimoMail(email: string): Promise<string> {
  for (let intento = 0; intento < 20; intento++) {
    const res = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
    );
    if (res.ok) {
      const data = (await res.json()) as { messages?: ResumenMail[] };
      const ultimo = data.messages?.[0];
      if (ultimo) {
        const det = await fetch(`${MAILPIT}/api/v1/message/${ultimo.ID}`);
        const msg = (await det.json()) as { HTML?: string; Text?: string };
        return msg.HTML || msg.Text || "";
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No llegó ningún mail a ${email}`);
}

/** Extrae el primer link de verificación/recuperación del cuerpo del mail. */
export function extraerLinkDeAuth(cuerpo: string): string {
  // Supabase manda un link al endpoint /auth/v1/verify que luego redirige al
  // redirect_to. Tomamos el primer href http(s).
  const match = cuerpo.match(/href="(https?:\/\/[^"]+)"/i);
  if (!match) throw new Error("El mail no tenía ningún link");
  return match[1].replace(/&amp;/g, "&");
}
```

- [ ] **Step 6: Adaptar `entrarComoUsuarioNuevo` en `flujos.spec.ts`**

Ahora, con la confirmación prendida, el signup no da sesión: hay que seguir el link del mail. Reemplazar el cuerpo del helper (y su comentario) por:

```ts
import { leerUltimoMail, extraerLinkDeAuth } from "./helpers/mail";

/**
 * Registra un usuario nuevo, confirma su email siguiendo el link del atrapa-mails
 * y deja activo el portafolio por defecto. Con la confirmación prendida, el
 * signup no devuelve sesión hasta confirmar.
 */
async function entrarComoUsuarioNuevo(page: Page): Promise<string> {
  await sinDatosDeMercado(page);
  const email = `e2e-${randomUUID()}@ejemplo.test`;

  await page.goto("/signup");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirmPassword"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  // Confirmar: seguir el link del mail. El callback deja la sesión y aterriza
  // en /dashboard.
  const cuerpo = await leerUltimoMail(email);
  await page.goto(extraerLinkDeAuth(cuerpo));

  await elegirPortafolioPorDefecto(page);
  return email;
}
```

- [ ] **Step 7: Correr los 5 E2E existentes y verificar que siguen verdes**

Run: `npm run test:e2e -- flujos.spec.ts`
Expected: los 5 tests PASS. Si `elegirPortafolioPorDefecto` falla por no haber sesión, revisar que el callback redirige a `/dashboard` y que el link extraído es el de `/auth/v1/verify` (no un link a un asset). Diagnosticar con `superpowers:systematic-debugging` antes de tocar nada más.

- [ ] **Step 8: Commit**

```bash
git add supabase/config.toml playwright.config.ts tests/e2e/helpers/mail.ts tests/e2e/flujos.spec.ts
git commit -m "test(e2e): prender confirmación de email y confirmar vía atrapa-mails"
```

---

### Task 6: E2E de los flujos nuevos

Cuatro flujos nuevos en su propio archivo, usando el helper de atrapa-mails.

**Files:**
- Create: `tests/e2e/verificacion-email.spec.ts`

**Interfaces:**
- Consumes: `leerUltimoMail`, `extraerLinkDeAuth` (Task 5).
- Produces: nada.

- [ ] **Step 1: Escribir los cuatro tests**

Crear `tests/e2e/verificacion-email.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { extraerLinkDeAuth, leerUltimoMail } from "./helpers/mail";

const PASSWORD = "Prueba1234!";
const PASSWORD_NUEVA = "Nueva5678!";

async function registrar(page: Page, email: string) {
  await page.goto("/signup");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirmPassword"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
}

test("registro: sin confirmar no entra; tras seguir el link del mail, sí", async ({
  page,
}) => {
  const email = `e2e-${randomUUID()}@ejemplo.test`;
  await registrar(page, email);

  // Intento de login sin confirmar: ve el aviso y la opción de reenviar.
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByText(/no confirmaste tu email/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reenviar email de confirmación" })
  ).toBeVisible();

  // Confirma siguiendo el link del mail y ahora sí entra.
  const cuerpo = await leerUltimoMail(email);
  await page.goto(extraerLinkDeAuth(cuerpo));
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
});

test("reenvío de confirmación manda un segundo mail", async ({ page }) => {
  const email = `e2e-${randomUUID()}@ejemplo.test`;
  await registrar(page, email);
  await leerUltimoMail(email); // primer mail (el del alta)

  await page.goto("/login?sinConfirmar=1&error=x");
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("button", { name: "Reenviar email de confirmación" }).click();
  await expect(page.getByText(/te reenviamos el correo/i)).toBeVisible();
});

test("recuperación: pido enlace, elijo contraseña nueva y entro con ella", async ({
  page,
}) => {
  // Registro + confirmación para tener una cuenta usable.
  const email = `e2e-${randomUUID()}@ejemplo.test`;
  await registrar(page, email);
  await page.goto(extraerLinkDeAuth(await leerUltimoMail(email)));
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
  await page.getByRole("button", { name: "Salir" }).click();

  // Pido recuperación.
  await page.goto("/forgot-password");
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText(/si el email está registrado/i)).toBeVisible();

  // Sigo el link (el mail más reciente es el de recuperación) y fijo la nueva.
  await page.goto(extraerLinkDeAuth(await leerUltimoMail(email)));
  await expect(page).toHaveURL(/\/reset-password/, { timeout: 30000 });
  await page.locator('input[name="password"]').fill(PASSWORD_NUEVA);
  await page.locator('input[name="confirmPassword"]').fill(PASSWORD_NUEVA);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });

  // Cierro sesión y entro con la contraseña NUEVA.
  await page.getByRole("button", { name: "Salir" }).click();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD_NUEVA);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
});

test("anti-enumeración: forgot con email inexistente da el mismo mensaje", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page.locator('input[name="email"]').fill(`no-existe-${randomUUID()}@ejemplo.test`);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText(/si el email está registrado/i)).toBeVisible();
});
```

- [ ] **Step 2: Correr los E2E nuevos**

Run: `npm run test:e2e -- verificacion-email.spec.ts`
Expected: los 4 tests PASS. Ante fallos, `superpowers:systematic-debugging` (revisar el link extraído, el orden de los mails en recuperación, los timeouts del atrapa-mails).

- [ ] **Step 3: Correr TODA la suite E2E (regresión)**

Run: `npm run test:e2e`
Expected: los 5 viejos + 4 nuevos en verde.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/verificacion-email.spec.ts
git commit -m "test(e2e): flujos de confirmación de registro y recuperación de contraseña"
```

---

### Task 7: Runbook de despliegue gratuito y activación de SMTP

Documento aparte (no enterrado en el spec) con el paso a paso para hostear gratis y activar los mails reales cuando el dueño consiga un dominio.

**Files:**
- Create: `docs/despliegue-gratuito.md`
- Modify: `CLAUDE.md` (un puntero al runbook en la sección de estado)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Crear `docs/despliegue-gratuito.md`**

Redactar el runbook con estas secciones (contenido en español, tono para no técnico), tomando el detalle de la sección "Despliegue y activación en producción" del spec `docs/superpowers/specs/2026-07-29-verificacion-email-design.md`:

1. **Base + Auth: Supabase free tier** — proyecto ya existe; se pausa a los 7 días sin uso; migraciones `schema.sql`→`017` ya corridas.
2. **Front: Vercel (Hobby, gratis)** — conectar repo; variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (la URL de Vercel); cargar esa URL en Supabase → Auth → Site URL + Redirect URLs (`.../auth/callback`).
3. **Prender "Confirm email"** en Supabase → Authentication.
4. **Mails reales: Resend + el límite del dominio** — free tier (100/día); cargar SMTP en Supabase → Auth → SMTP Settings; el único costo es el dominio (~USD 10/año) para mandar a terceros. Sin dominio, solo a la propia casilla.
5. **Checklist de "listo para producción"** — reactivar Confirm email, SMTP con dominio, revisar que los links de los mails apunten a la URL de Vercel y no a localhost.

- [ ] **Step 2: Agregar el puntero en `CLAUDE.md`**

En la sección de estado/pendientes de `CLAUDE.md`, agregar una línea que apunte a `docs/despliegue-gratuito.md` como la guía de despliegue (leer el archivo antes para respetar el estilo y ubicarlo bien).

- [ ] **Step 3: Commit**

```bash
git add docs/despliegue-gratuito.md CLAUDE.md
git commit -m "docs: runbook de despliegue gratuito y activación de mails"
```

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** Flujo A → Tasks 1-2, 5-6. Flujo B → Tasks 3-4, 6. Seguridad (anti-enumeración, política reusada, email fuera de URL) → Tasks 2-4. Testing → Tasks 1, 5, 6. Runbook → Task 7. Sin huecos.
- **Sin placeholders:** todo el código va completo. El único punto con condicional real es la API del atrapa-mails (Task 5, Step 4) — se verifica antes de escribir el helper, con la alternativa Inbucket anotada.
- **Consistencia de tipos/nombres:** `traducirErrorAuth`/`esEmailSinConfirmar` (Task 1) usados igual en Task 2; `reenviarConfirmacion` (Task 2) usado en `login/page.tsx`; `leerUltimoMail`/`extraerLinkDeAuth` (Task 5) usados en Tasks 5-6; `establecerPassword`/`pedirRecuperacion` coinciden entre página y action.

## Notas de riesgo (fuera del camino feliz)

- **Intercambio del code en el callback (PKCE):** el flujo signup→callback recién se ejerce de verdad al prender la confirmación. Si el `exchangeCodeForSession` fallara por el cookie del `code_verifier`, la Task 5 Step 7 lo detecta (los 5 E2E no entran). Alternativa documentada si pasa: confirmar el usuario de setup vía admin API (`admin.updateUserById(id, { email_confirm: true })`) con la `SERVICE_ROLE_KEY` de `supabase status`, dejando la confirmación por link solo para el test dedicado de la Task 6.
- **Orden de los mails en recuperación (Task 6):** el test asume que el mail más reciente es el de recuperación. Si el atrapa-mails ordenara distinto, filtrar por asunto/tipo en `leerUltimoMail`.
