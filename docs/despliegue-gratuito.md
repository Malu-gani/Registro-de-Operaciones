# Despliegue gratuito y activación de mails

Esta app se puede hostear **entera gratis**. El único costo real aparece recién
cuando querés mandar mails de verdad a otras personas (hace falta un dominio,
~USD 10/año). Mientras tanto corre local o en Vercel para uso propio.

> Orden sugerido: 1 (base) → 2 (hosting) → 3 (mails). Los pasos 1 y 2 dejan la
> app andando; el 3 es el que necesita el dominio.

## 1. Base de datos + Auth — Supabase (free tier)

- Ya existe el proyecto en la nube (el que usa la app hoy). El free tier alcanza
  de sobra para uso personal (500 MB de base).
- **Ojo:** los proyectos free **se pausan tras 7 días sin actividad**. Con entrar
  al dashboard o usar la app se reactivan. Es gratis, solo molesto.
- Las migraciones (`schema.sql` → `017`) ya están todas corridas.

## 2. Hosting del front — Vercel (plan Hobby, gratis)

1. Entrá a vercel.com, "Add New Project" y conectá el repo de GitHub.
2. Vercel detecta Next.js solo; no hay que configurar build.
3. En **Environment Variables** cargá:
   - `NEXT_PUBLIC_SUPABASE_URL` — la URL de tu proyecto Supabase.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — la anon key de Supabase.
   - `NEXT_PUBLIC_SITE_URL` — la URL pública de Vercel (ej.
     `https://mi-app.vercel.app`). **Es importante:** con esto se arman los links
     de los mails de confirmación/recuperación. Si falta, apuntan a localhost.
4. Deploy. Anotá la URL final de Vercel.
5. En Supabase → **Authentication → URL Configuration**:
   - **Site URL:** la URL de Vercel.
   - **Redirect URLs:** agregá `https://mi-app.vercel.app/**` (cubre
     `/auth/confirm`, que es a donde llevan los mails).

## 3. Mails reales — Resend + el límite del dominio

El email propio de Supabase es solo para pruebas (2 por hora). Para producción:

1. En Supabase → **Authentication** → prender **"Confirm email"** (Email
   provider → Confirm email).
2. **Plantillas de mail (paso propio de esta app, no olvidar):** la app usa
   plantillas con `token_hash` para que el link del mail funcione desde cualquier
   dispositivo. En **local** viven en `supabase/templates/*.html` (las lee el
   `config.toml`), pero **el proyecto en la nube NO lee ese config**: hay que
   cargarlas a mano en Supabase → **Authentication → Email Templates**:
   - **Confirm signup:** el link tiene que ser
     `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup`
     (copiá el cuerpo de `supabase/templates/confirmation.html`).
   - **Reset password:** el link tiene que ser
     `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`
     (copiá el cuerpo de `supabase/templates/recovery.html`).
   - Si dejás las plantillas por defecto (que usan el link PKCE), la confirmación
     falla al abrir el mail en otro dispositivo. Por eso este paso importa.
3. **SMTP con Resend (gratis):** creá una cuenta en resend.com (free: 100
   mails/día, 3.000/mes). En Supabase → **Authentication → SMTP Settings**
   cargá los datos SMTP de Resend (host `smtp.resend.com`, puerto 587, usuario
   `resend`, la API key como contraseña).
4. **El único costo/límite — el dominio:** Resend (como todos) exige **verificar
   un dominio propio** para mandar a cualquier destinatario. Un dominio sale
   ~USD 10/año. Sin dominio, solo podés mandarte mails a la casilla de tu propia
   cuenta de Resend (sirve para probarte a vos, no para usuarios reales).

## Checklist de "listo para producción"

- [ ] `NEXT_PUBLIC_SITE_URL` en Vercel = la URL real de Vercel.
- [ ] Site URL + Redirect URLs en Supabase apuntan a esa URL.
- [ ] "Confirm email" prendido.
- [ ] Plantillas de mail (confirmación y recuperación) cargadas con `token_hash`.
- [ ] SMTP de Resend configurado y dominio verificado.
- [ ] Probar de punta a punta: registrarte con un email real, confirmar desde el
      link, y recuperar contraseña.

> Recordá que en local nada de esto hace falta: el `config.toml` ya deja todo
> listo y los mails los captura el atrapa-mails en `http://127.0.0.1:54324`.
