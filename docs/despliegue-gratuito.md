# Despliegue gratuito y activación de mails

Esta app se puede hostear **entera gratis y 100% funcional**. Para tu caso —vos
ahora, y más adelante tu primo y uno o dos amigos (gente conocida)— **nunca hace
falta pagar nada**. El único costo posible (un dominio, ~USD 10/año) aparece
recién si algún día la abrieras a desconocidos.

> Orden sugerido: 1 (base) → 2 (hosting) → 3 (mails). Los pasos 1 y 2 dejan la
> app andando; el 3 se organiza en fases para que arranques sin configurar mail
> y solo agregues envío de correos cuando sumes a otras personas.

## Estado del despliegue (2026-07-29)

**Fases A y B desplegadas y verificadas.** La app está online y con mails
propios andando, todo gratis:

- **URL de producción:** https://registro-de-operaciones-chi.vercel.app
- **Hosting:** Vercel, plan Hobby (gratis). El entorno *Production* sigue la rama
  `main`: cada merge a `main` redeploya solo.
- **Variables cargadas en Vercel:** `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SITE_URL` (= la URL de arriba).
- **URLs de Supabase:** Site URL y Redirect URLs (`…/**`) ya apuntan a la URL de
  producción.
- **Mails:** SMTP propio vía Gmail, plantillas con `token_hash` cargadas y
  **`Confirm email` activado** (ver Fase B). La app queda lista para que se
  registren otras personas.

**Verificado en producción (Fase A):** la app carga sin errores de consola;
`NEXT_PUBLIC_SITE_URL` quedó bien tomada en el build (`/auth/confirm` sin token
redirige al dominio de Vercel, no a `localhost`); el registro de un usuario nuevo
funciona sin mail (como corresponde con `Confirm email` apagado); y los precios en
vivo cargan bien desde Vercel, tanto acciones (AAPL / Yahoo Finance) como cripto
(BTC / CoinGecko).

**Verificado en producción (Fase B) — los dos flujos de mail:**

- **Recuperación de contraseña.** El mail sale por el SMTP de Gmail, el aviso en
  pantalla no revela si la dirección existe o no (comportamiento buscado), y —lo
  importante— **el link se abrió en otro dispositivo** (celular Android, distinto
  de la PC que pidió el reset): se pudo elegir la contraseña nueva, la sesión
  quedó abierta en el celular y después el login desde la PC funcionó con la
  contraseña nueva.
- **Confirmación de registro**, con `Confirm email` ya activado: alta de un
  usuario de prueba, rechazo del login mientras estaba sin confirmar (con la
  opción de reenviar el correo), confirmación abriendo el link **desde el
  celular**, y login posterior desde la PC. El usuario de prueba se borró después
  desde Authentication → Users.

Los dos casos confirman que el enfoque `token_hash` sirve cross-device, que era
el punto del diseño (los links PKCE por defecto fallan justo en ese paso).

> **Sobre la anon key:** el proyecto usa el formato nuevo de claves de Supabase
> (`sb_publishable_...`), que es la reemplazante de la vieja `anon` key y es
> segura para el navegador (la protección real la da el RLS). El nombre de la
> variable sigue siendo `NEXT_PUBLIC_SUPABASE_ANON_KEY`. **Nunca** usar la
> *secret key* (`sb_secret_...`) en una variable `NEXT_PUBLIC`: saltea el RLS y
> quedaría expuesta en el navegador.

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

   > **Gotchas de la UI de Vercel** (vividos en el despliegue real):
   > - En Settings hay dos entradas parecidas: **"Environment Variables"** (la
   >   que sirve, donde se cargan las claves) y **"Environments"** (para crear
   >   entornos tipo staging, **es función paga de Pro — no hace falta**).
   > - `NEXT_PUBLIC_SITE_URL` se incrusta durante el build: si la agregás o
   >   cambiás después del primer deploy, hay que **Redeploy** (Deployments →
   >   ⋯ → Redeploy, destildando "Use existing Build Cache"). Sin eso, la
   >   variable no existe para la app.
   > - La URL va **sin la barra final** (`https://algo.vercel.app`, no
   >   `.../`).

5. En Supabase → **Authentication → URL Configuration**:
   - **Site URL:** la URL de Vercel.
   - **Redirect URLs:** agregá `https://mi-app.vercel.app/**` (cubre
     `/auth/confirm`, que es a donde llevan los mails).

Con los pasos 1 y 2 la app ya está online y usable. El mail se agrega por fases
abajo, según cuánta gente la use.

## 3. Mails — enfoque por fases

En la app el email verificado gatilla **solo dos cosas**: confirmar el registro
y recuperar la contraseña. Todo el resto (operaciones, portafolios, precios,
dashboard, saldos, ajustes) **no depende del email para nada**. Por eso podés
arrancar sin configurar ningún correo.

### Fase A — Ahora, solo vos (gratis, sin configurar mail)

- En Supabase → **Authentication → Providers → Email**: dejá **"Confirm email"
  APAGADO**. Te registrás con email + contraseña y entrás directo, sin mail.
- **¿Y si te olvidás tu propia contraseña?** No necesitás mail: la reseteás vos
  desde **Supabase → Authentication → Users**, buscás tu usuario y usás la opción
  de resetear/cambiar contraseña. 10 segundos.
- **¿Y si te olvidás con qué email te registraste?** Esa misma pantalla
  (Authentication → Users) lista todos los usuarios, así que ahí lo encontrás.
  **Importante:** no resuelvas el olvido registrando una cuenta nueva — el RLS
  filtra por usuario, así que desde otra cuenta **no vas a ver tus operaciones ni
  tus portafolios**; quedan colgados del usuario original. Recuperá el usuario
  viejo y borrá el de más (⋯ → Delete user) para no dejar cuentas huérfanas.
- **Costo: $0. Nada de SMTP, nada de dominio.** Esta fase alcanza mientras seas
  el único usuario.

### Fase B — Cuando sumes al primo y amigos (gratis, self-service)

Cuando haya otras personas, conviene que cada una pueda recuperar su contraseña
sola (sin que quedes vos de mesa de ayuda). Para eso hace falta que la app pueda
mandar mails a las casillas de ellos. Se hace **gratis usando tu propio Gmail
como servidor SMTP** (Resend sin dominio NO sirve acá: solo deja mandarte mails a
tu propia casilla, no a la de otros).

1. **Preparar tu cuenta de Google (una sola vez):**
   - Activá la **verificación en dos pasos (2FA)** en tu cuenta de Google (es
     requisito para el paso siguiente).
   - Generá una **"contraseña de aplicación"** en
     Google → Seguridad → Contraseñas de aplicaciones. Te da una clave de 16
     caracteres: esa es la que vas a usar como contraseña SMTP (no tu contraseña
     normal de Gmail).
2. **Cargar el SMTP en Supabase** → **Authentication → SMTP Settings**:
   - Host: `smtp.gmail.com`
   - Puerto: `587`
   - Usuario: tu dirección de Gmail completa.
   - Contraseña: la "contraseña de aplicación" de 16 caracteres del paso 1.
   - Sender email / Sender name: tu Gmail y el nombre que quieras que vean.
     **El sender email tiene que ser el mismo Gmail que el usuario**, o Gmail
     rechaza el envío.
3. **Plantillas de mail (paso propio de esta app, NO olvidar):** la app usa
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
4. **Probá la recuperación de contraseña ANTES de prender nada más.** Andá a
   `/forgot-password` en producción, pedí el reset de tu propia cuenta y **abrí el
   link desde otro dispositivo** (el celular), que es justo el caso que rompen las
   plantillas por defecto. Confirmá que podés elegir contraseña nueva y después
   entrar con ella desde la compu.
   - **Por qué en este orden:** la recuperación no puede dejar a nadie afuera, así
     que es la prueba segura del SMTP + las plantillas. Si en cambio prendieras
     `Confirm email` con el SMTP mal configurado, un usuario nuevo se registraría
     y **nunca podría entrar**, porque no le llegaría el mail de confirmación.
5. **Prendé "Confirm email"** recién cuando el paso 4 funcione. Está en
   Authentication → **Sign In / Providers** (antes solo "Providers") → expandí el
   proveedor **Email** → toggle **"Confirm email"** → Save. No afecta a los
   usuarios que ya existen (siguen entrando normal): solo obliga a confirmar a los
   que se registren de ahí en adelante.
   - **Por qué conviene con más de una persona:** garantiza que la dirección sea
     real y de quien se registra. Si alguien se equivoca al tipear su email y la
     confirmación está apagada, entra igual — pero después **la recuperación de
     contraseña le resulta imposible** (el mail va a una casilla que no controla)
     y volvés a ser vos la mesa de ayuda.
   - **Cómo probarlo sin crear otra casilla:** Gmail ignora todo lo que va después
     de un `+`, así que `tu.email+prueba@gmail.com` llega a tu misma casilla pero
     para Supabase es un usuario distinto. Registrate con esa dirección, **probá
     primero que el login te rechace mientras no confirmás** (y que ofrezca
     reenviar el correo), confirmá abriendo el link **desde el celular**, entrá
     desde la compu, y después borrá ese usuario en Authentication → Users.
     Ojo al borrar: verificá que sea el que tiene `+prueba` y no tu cuenta real.
   - La contraseña del registro debe cumplir la política de la app: mínimo 8
     caracteres con mayúscula, minúscula, número y carácter especial
     (`src/utils/passwordPolicy.ts`).
6. **Caveats del Gmail SMTP** (irrelevantes a esta escala, pero para que sepas):
   límite de envío de ~500 mails/día, y los correos salen "desde tu Gmail" en vez
   de un dominio propio. Para un puñado de personas conocidas, ningún problema.

### Fase C — Si algún día lo abrís al público (~USD 10/año)

Solo si dejaras que se registre cualquiera (desconocidos). Ahí el Gmail SMTP se
queda corto (deliverability, límites, imagen) y conviene un servicio de mail
transaccional con dominio propio:

1. En Supabase → **Authentication** → prender **"Confirm email"**.
2. Cargar las mismas **plantillas con `token_hash`** de la Fase B (paso 3).
3. **SMTP con Resend:** creá una cuenta en resend.com (free: 100 mails/día,
   3.000/mes). En Supabase → **Authentication → SMTP Settings** cargá los datos
   SMTP de Resend (host `smtp.resend.com`, puerto 587, usuario `resend`, la API
   key como contraseña).
4. **El costo — el dominio:** Resend (como todos) exige **verificar un dominio
   propio** para mandar a cualquier destinatario. Un dominio sale ~USD 10/año.
   Sin dominio, solo podés mandarte mails a tu propia casilla.

## Checklists

**Listo para uso propio (Fase A) — hecho:**

- [x] `NEXT_PUBLIC_SITE_URL` en Vercel = la URL real de Vercel.
- [x] Site URL + Redirect URLs en Supabase apuntan a esa URL.
- [x] "Confirm email" apagado.
- [x] Probaste registrarte y entrar; sabés que tu contraseña la reseteás desde
      Authentication → Users si hace falta.

**Listo para compartir con conocidos (Fase B):**

- [x] 2FA + "contraseña de aplicación" generada en tu cuenta de Google.
- [x] SMTP de Gmail cargado en Supabase (`smtp.gmail.com`:587, tu gmail + la
      app-password; sender = el mismo gmail).
- [x] Plantillas de mail (confirmación y recuperación) cargadas con `token_hash`.
- [x] Recuperación de contraseña probada de punta a punta, **abriendo el link en
      otro dispositivo** (celular) y después entrando desde la compu.
- [x] "Confirm email" prendido.
- [x] Registro probado de punta a punta con una dirección `+prueba` (alta, rechazo
      del login sin confirmar, confirmación desde el celular, login desde la PC) y
      usuario de prueba borrado después.

**Todo cerrado: la app está lista para compartir, a costo $0.**

> Recordá que en local nada de esto hace falta: el `config.toml` ya deja todo
> listo y los mails los captura el atrapa-mails en `http://127.0.0.1:54324`.
