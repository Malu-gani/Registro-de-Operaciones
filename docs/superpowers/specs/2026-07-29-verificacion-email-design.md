# Verificación por email — Diseño

**Fecha:** 2026-07-29
**Estado:** aprobado (pendiente de plan de implementación)

## Objetivo

Cerrar el hueco de auth de cara a producción: exigir que el usuario **confirme
su email al registrarse** y darle una forma de **recuperar la contraseña** si la
olvida. Hoy "Confirm email" está apagado en Supabase y no existe ningún flujo de
recuperación.

## Alcance

**Entra:**
- Confirmación de registro (completar y *endurecer* lo que ya está cableado).
- Recuperación de contraseña (flujo nuevo, de cero).
- Tests (E2E + unitarios) que cubran ambos flujos.
- Instructivo de activación en producción (SMTP real) y de despliegue gratuito.

**No entra (queda como tarea al final, con guía):**
- Crear la cuenta de Resend, verificar un dominio y prender el SMTP real: requiere
  acciones del dueño (cuenta + dominio pago ~USD 10/año). Se documenta, no se
  implementa acá.
- El despliegue en sí (Vercel + Supabase cloud): se documenta como runbook.

## Estado actual del código (punto de partida)

- `src/app/signup/actions.ts` — ya llama a `supabase.auth.signUp` con
  `emailRedirectTo: ${siteUrl}/auth/callback` y redirige a `/login` con el aviso
  "Revisá tu email para confirmar la cuenta". **El registro ya manda el mail.**
- `src/app/auth/callback/route.ts` — ya hace `exchangeCodeForSession(code)` (flujo
  PKCE) y redirige a `next ?? /dashboard`. **Sirve tal cual para recuperación**
  (solo hay que pasarle `next=/reset-password`).
- `src/app/login/actions.ts` — `signInWithPassword`; ante error redirige a
  `/login?error=<msg crudo de Supabase>`.
- `src/app/login/page.tsx` — muestra `?error` y `?message`; NO tiene link de
  "olvidé mi contraseña".
- `src/components/ajustes/SeccionCuenta.tsx` — único lugar que hoy usa
  `updateUser` (cambio de contraseña estando logueado). La política vive en
  `src/utils/passwordPolicy.ts` (`validarPassword`), ya con tests unitarios.
- `supabase/config.toml` — `[local_smtp]` (atrapa-mails) **habilitado en :54324**;
  `[auth] enable_confirmations = false`; `[auth.rate_limit] email_sent = 2`;
  `site_url = "http://127.0.0.1:3000"`; bloque `[auth.email.smtp]` comentado.

## Decisión de arquitectura

> **Corrección durante la implementación (2026-07-29):** se descartó el flujo
> PKCE para los mails. El PKCE guarda el `code_verifier` en un cookie del
> navegador donde se inició, así que la confirmación fallaba al abrir el mail en
> otro dispositivo (registrás en la compu, confirmás en el cel) o al intentar
> login antes de confirmar. Se pasó a **`verifyOtp` con `token_hash`**: no
> depende de cookies previos y el link anda desde cualquier lado. Es el estándar
> de Supabase para email; el `code`/PKCE queda reservado para OAuth. Implica
> **plantillas de mail propias** (`supabase/templates/`) que linkean a
> `/auth/confirm?token_hash=...&type=...`, y un route handler que verifica y
> setea la sesión sobre la respuesta de redirect.

Se reutiliza el patrón de cookies-sobre-la-respuesta del middleware para que la
sesión sobreviva al redirect (con el cliente basado en `next/headers`, un
`NextResponse.redirect` a mano no arrastra las cookies). El redirect se arma con
`NEXT_PUBLIC_SITE_URL`, no con el `origin` de `request.url` (que `next start`
puede reportar como `localhost` aunque el navegador esté en otro host).

Rutas nuevas **fuera del grupo `(app)`** (igual que `/login` y `/signup`, sin
sidebar ni protección de sesión de la app): `/forgot-password` y
`/reset-password`.

---

## Flujo A — Confirmación de registro

### Comportamiento

1. El usuario se registra en `/signup` (ya implementado). Supabase manda el mail
   de confirmación al `emailRedirectTo`.
2. Hasta que no confirme, `signInWithPassword` devuelve `"Email not confirmed"`.
3. En `/login`, ese error se traduce a un aviso en español:
   *"Todavía no confirmaste tu email. Revisá tu casilla o reenviá el correo."*
   junto a un botón **"Reenviar email de confirmación"**.
4. El botón dispara una server action que llama a
   `supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo } })`
   y vuelve a `/login` con un `?message` de confirmación ("Te reenviamos el
   correo"). **El email lo toma de un campo del propio formulario de reenvío, no
   de la URL** (no se pasa el email por query string: es dato personal). En la
   práctica el botón vive en un `<form>` con un input de email (prellenable con
   lo que el usuario ya tipeó del lado del cliente, pero nunca en un `?email=`).
5. Al hacer click en el link del mail → `/auth/callback` → sesión →
   `/dashboard` (ya funciona).

### Cambios

- `supabase/config.toml`: `enable_confirmations = true` (para que el entorno
  local/tests ejerza la confirmación).
- Dashboard cloud: prender "Confirm email" (tarea del dueño, en el runbook).
- `src/app/login/actions.ts`: traducir `"Email not confirmed"` (y otros errores
  crudos frecuentes) vía un helper puro nuevo `traducirErrorAuth(mensaje)`.
- `src/app/login/page.tsx`: cuando el error sea "email sin confirmar", mostrar el
  botón de reenvío (form → server action `reenviarConfirmacion`).
- Nueva server action `reenviarConfirmacion(formData)` (en `login/actions.ts` o un
  archivo hermano).

### Gotcha documentado

Los usuarios creados **mientras la confirmación estaba apagada** quedaron
auto-confirmados (`email_confirmed_at` seteado al alta). Prender
`enable_confirmations` **no los retro-desconfirma**: la cuenta del dueño y las de
prueba siguen entrando. Solo afecta a registros nuevos.

---

## Flujo B — Recuperación de contraseña

### Comportamiento

1. En `/login`, link **"¿Olvidaste tu contraseña?"** → `/forgot-password`.
2. `/forgot-password`: input de email + botón. Server action
   `pedirRecuperacion(formData)` llama a
   `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${siteUrl}/auth/callback?next=/reset-password })`.
   **Responde siempre lo mismo**, exista o no el email:
   *"Si el email está registrado, te mandamos un enlace para recuperar la
   contraseña."* (no filtra qué correos existen).
3. El link del mail → `/auth/callback` intercambia el code por una sesión de
   recuperación → redirige a `/reset-password`.
4. `/reset-password`: inputs "contraseña nueva" + "repetir", botón. Server action
   `establecerPassword(formData)`:
   - valida con `validarPassword` (misma política que Ajustes) y que ambas
     coincidan;
   - `supabase.auth.updateUser({ password })`;
   - éxito → el usuario ya quedó logueado por la sesión de recuperación →
     redirige a `/dashboard`.
5. Si alguien abre `/reset-password` **sin** una sesión válida (link vencido,
   navegación directa), la página detecta que no hay usuario y redirige a
   `/forgot-password` con un aviso ("El enlace venció o no es válido, pedí uno
   nuevo").

### Cambios

- Crear `src/app/forgot-password/page.tsx` + `src/app/forgot-password/actions.ts`.
- Crear `src/app/reset-password/page.tsx` + `src/app/reset-password/actions.ts`.
- `src/app/login/page.tsx`: agregar el link a `/forgot-password`.
- Reusar los estilos de `/login` y `/signup` (mismas clases Tailwind, misma
  tarjeta centrada).

---

## Errores y seguridad

- **Política de contraseña reusada:** `validarPassword` en `/reset-password`, sin
  duplicar reglas.
- **No enumerar emails:** `/forgot-password` responde igual exista o no la cuenta.
- **Mensajes en español:** ningún error crudo de Supabase llega al usuario; pasan
  por `traducirErrorAuth`.
- **Rutas de recuperación sin sesión de app:** viven fuera de `(app)`, así que no
  las toca el middleware de sesión; `/reset-password` hace su propio chequeo de
  sesión de recuperación.

---

## Testing

Objetivo: cubrir ambos flujos de punta a punta, aprovechando que el Supabase
local trae atrapa-mails. Es la parte de más valor para el portfolio de QA.

### E2E (Playwright) — leyendo el atrapa-mails local

El atrapa-mails (`local_smtp`) expone una API HTTP en `:54324` para listar y leer
los correos capturados. Un helper `leerUltimoMail(email)` consulta esa API,
agarra el mail más reciente para ese destinatario y extrae el link de
confirmación/recuperación. Flujos:

1. **Registro con confirmación:** signup por UI → `leerUltimoMail` → seguir el
   link → verificar que quedó confirmado y puede entrar al dashboard.
2. **Login sin confirmar:** registrarse, intentar login sin confirmar → ver el
   aviso en español + el botón de reenvío → tocar reenviar → verificar que llegó
   un segundo mail.
3. **Recuperación:** desde `/login` → "olvidé mi contraseña" → pedir con un email
   existente → `leerUltimoMail` → seguir el link → poner contraseña nueva →
   cerrar sesión → **login con la contraseña nueva OK** (y la vieja falla).
4. **Anti-enumeración:** `/forgot-password` con un email inexistente devuelve el
   mismo mensaje genérico (no revela que no existe).

### Unitarios

- `traducirErrorAuth`: mapea los mensajes crudos de Supabase conocidos
  (`"Email not confirmed"`, credenciales inválidas, etc.) a texto en español, y
  deja pasar un genérico para los desconocidos.
- La validación de "contraseñas que no coinciden" si se extrae a función pura.

### Gotchas de test (anotados para el plan)

- Poner `enable_confirmations = true` en `config.toml` para que el entorno de
  test ejerza la confirmación. Verificar que la suite actual sigue verde: los
  usuarios de `crearUsuarioDePrueba` se crean con `admin.createUser({
  email_confirm: true })`, así que **no** dependen del flujo de confirmación.
- Subir `[auth.rate_limit] email_sent` (hoy en `2` por hora): los E2E disparan
  varios correos por corrida y el límite los tumbaría. Elegir un valor holgado
  para el entorno local.
- Los E2E necesitan el servidor de Next corriendo contra el Supabase local; ya
  hay patrón para esto en `tests/e2e` y `playwright.config.ts`.

---

## Despliegue y activación en producción (runbook — tarea al final)

Todo esto se puede hostear **gratis**. El único costo real aparece al querer
mandar mails a terceros con dominio propio.

### 1. Base de datos + Auth — Supabase (free tier)

- Ya existe el proyecto cloud. Free tier alcanza para uso personal (500 MB).
- **Se pausa tras 7 días sin actividad**; entrar al dashboard lo reactiva.
- Correr todas las migraciones (`schema.sql` → `017`) — ya están corridas.

### 2. Hosting del front — Vercel (plan Hobby, gratis)

- Conectar el repo de GitHub a Vercel; despliega el Next.js solo.
- Variables de entorno en Vercel: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SITE_URL` (la URL pública de
  Vercel, ej. `https://mi-app.vercel.app`).
- En Supabase → Authentication → URL Configuration: poner esa URL en **Site URL**
  y en **Redirect URLs** (`https://mi-app.vercel.app/auth/callback`), si no los
  links de los mails apuntan a localhost.

### 3. Envío de mails — Resend (free tier) + el límite del dominio

- En Supabase → Authentication → prender **"Confirm email"**.
- El email propio de Supabase es solo para pruebas (2/hora). Para producción:
  crear cuenta en **Resend** (gratis: 100 mails/día, 3.000/mes) y cargar sus
  datos SMTP en Supabase → Authentication → SMTP Settings (host, puerto, user,
  API key como password).
- **Acá está el único costo/límite:** Resend (como todos) exige **verificar un
  dominio propio** para mandar a cualquier destinatario. Un dominio sale ~USD
  10/año. Sin dominio, solo se puede mandar al email de la propia cuenta de
  Resend (sirve para probarte a vos, no para usuarios reales).
- **Decisión:** este paso queda para cuando el dueño consiga el dominio; hasta
  entonces la app corre local con el atrapa-mails, o en Vercel con el email de
  prueba de Supabase para uso propio.

## Preguntas abiertas

Ninguna. Diseño cerrado con el dueño el 2026-07-29.
