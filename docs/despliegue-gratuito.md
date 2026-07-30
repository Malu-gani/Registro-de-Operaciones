# Despliegue gratuito y activación de mails

Esta app se puede hostear **entera gratis y 100% funcional**. Para tu caso —vos
ahora, y más adelante tu primo y uno o dos amigos (gente conocida)— **nunca hace
falta pagar nada**. El único costo posible (un dominio, ~USD 10/año) aparece
recién si algún día la abrieras a desconocidos.

> Orden sugerido: 1 (base) → 2 (hosting) → 3 (mails). Los pasos 1 y 2 dejan la
> app andando; el 3 se organiza en fases para que arranques sin configurar mail
> y solo agregues envío de correos cuando sumes a otras personas.

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
3. **Prendé "Confirm email"** (Authentication → Providers → Email) si querés que
   los nuevos usuarios confirmen su dirección al registrarse. Opcional, pero
   recomendado cuando hay más de una persona.
4. **Plantillas de mail (paso propio de esta app, NO olvidar):** la app usa
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
5. **Caveats del Gmail SMTP** (irrelevantes a esta escala, pero para que sepas):
   límite de envío de ~500 mails/día, y los correos salen "desde tu Gmail" en vez
   de un dominio propio. Para un puñado de personas conocidas, ningún problema.

### Fase C — Si algún día lo abrís al público (~USD 10/año)

Solo si dejaras que se registre cualquiera (desconocidos). Ahí el Gmail SMTP se
queda corto (deliverability, límites, imagen) y conviene un servicio de mail
transaccional con dominio propio:

1. En Supabase → **Authentication** → prender **"Confirm email"**.
2. Cargar las mismas **plantillas con `token_hash`** de la Fase B (paso 4).
3. **SMTP con Resend:** creá una cuenta en resend.com (free: 100 mails/día,
   3.000/mes). En Supabase → **Authentication → SMTP Settings** cargá los datos
   SMTP de Resend (host `smtp.resend.com`, puerto 587, usuario `resend`, la API
   key como contraseña).
4. **El costo — el dominio:** Resend (como todos) exige **verificar un dominio
   propio** para mandar a cualquier destinatario. Un dominio sale ~USD 10/año.
   Sin dominio, solo podés mandarte mails a tu propia casilla.

## Checklists

**Listo para uso propio (Fase A):**

- [ ] `NEXT_PUBLIC_SITE_URL` en Vercel = la URL real de Vercel.
- [ ] Site URL + Redirect URLs en Supabase apuntan a esa URL.
- [ ] "Confirm email" apagado.
- [ ] Probaste registrarte y entrar; sabés que tu contraseña la reseteás desde
      Authentication → Users si hace falta.

**Listo para compartir con conocidos (Fase B):**

- [ ] 2FA + "contraseña de aplicación" generada en tu cuenta de Google.
- [ ] SMTP de Gmail cargado en Supabase (`smtp.gmail.com`:587, tu gmail + la
      app-password).
- [ ] "Confirm email" prendido (si querés confirmación al registrarse).
- [ ] Plantillas de mail (confirmación y recuperación) cargadas con `token_hash`.
- [ ] Probado de punta a punta: que un conocido se registre, confirme desde el
      link, y recupere contraseña.

> Recordá que en local nada de esto hace falta: el `config.toml` ya deja todo
> listo y los mails los captura el atrapa-mails en `http://127.0.0.1:54324`.
