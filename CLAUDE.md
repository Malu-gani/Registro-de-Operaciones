# Gestor de Portfolio y Operaciones

Diario de trading (acciones + cripto + plazo fijo) con cálculo automático de
gestión de riesgo (tamaño de posición, ratio R:R, % de riesgo de la
operación). El usuario (dueño del repo) no tiene background técnico —
explicaciones en las respuestas deben ser en español, sin asumir
conocimiento previo de stacks.

> **Nombres (para no confundirse):** el título visible de la app es **"Gestor
> de Portfolio y Operaciones"** (desde 2026-07-19). El repo de GitHub se llama
> `Registro-de-Operaciones` y la carpeta local `seguimiento-operaciones`; las
> memorias de Claude anteriores a esa fecha lo llaman "Diario de Trading".
> Todos refieren a este mismo proyecto.

> **Dónde vive el estado:** este archivo es la **puerta de entrada
> operativa** (cómo levantar, gotchas, punteros). El estado detallado, la
> historia de sesiones, el perfil del usuario y las decisiones abiertas
> viven ahora en las **memorias de Claude** (índice `MEMORY.md`; empezar por
> `project-overview`). Esas memorias son locales a la máquina y no se
> versionan con el repo — este `CLAUDE.md` es lo que viaja con el código.

## Stack

Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS v4 + Supabase
(Postgres, Auth, RLS) + Recharts (gráficos — tortas de Portafolio, curva de
Equity). Sin backend propio: toda la lógica de servidor vive en Server
Actions / Route Handlers de Next.js.

## Cómo levantar el proyecto

```
npm run dev
```

Requiere `.env.local` (no versionado) con `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY` — ver `.env.local.example`. El usuario ya
tiene un proyecto de Supabase creado y configurado (estado en la memoria
`project-supabase-state`).

## Cómo correr las pruebas

```
npm test
```

Corre unitarios y componentes (no necesita Docker). La integración SQL y los
E2E necesitan Supabase local — ver [`docs/testing.md`](docs/testing.md).

Para probar en el navegador embebido (Claude Browser tools): ya existe
`.claude/launch.json` con la config `next-dev` (puerto 3000) — usar
`preview_start` con `name: "next-dev"`.

**Gotchas de las preview tools**:
- Justo después de un `location.href = ...` (navegación completa),
  `preview_screenshot` puede colgarse ~30s. Preferir `preview_snapshot` en
  ese momento, o esperar antes del screenshot. En la sesión 2026-07-12
  `computer{screenshot}` se colgó 30s incluso sin navegar — cuando pasa,
  usar `get_page_text` para contenido y `javascript_tool`
  (`querySelector` + `dispatchEvent(new Event(...,{bubbles:true}))` para
  inputs controlados de React, `form.requestSubmit()` para submits) en vez
  de insistir con screenshots o clicks por coordenadas.
- `preview_click` puede no hacer nada si se dispara inmediatamente después
  de una navegación (React todavía no hidrató) — si un click no tiene
  efecto, reintentar o usar `preview_eval` con `.click()` directo sobre el
  elemento.
- El selector `button[type="submit"]` es ambiguo: el Navbar (`Navbar.tsx`)
  tiene un botón "Salir" que también es `type="submit"` dentro de un
  `<form>` de Server Action, y suele aparecer antes en el DOM que el botón
  de guardar del formulario principal. Un click ciego a ese selector cierra
  la sesión en vez de guardar. Escopear siempre al form correcto, ej.
  filtrando por el que NO tiene `input[type=hidden]` (el de logout sí lo
  tiene, por el `$ACTION_ID` de la Server Action).
- Si el proyecto ya tiene un `next dev` corriendo (otra sesión de Claude, o
  el propio usuario vía VS Code), Next.js bloquea una segunda instancia por
  el lock de `.next/` — no se puede levantar otro servidor en paralelo
  sobre el mismo directorio, ni cambiando de puerto. Hay que esperar a que
  se libere o pedirle al usuario que cierre el suyo. El usuario y Claude
  nunca corren `npm run dev` a la vez (ver memoria `feedback-manual-qa-testing`).
- **Caché de `.next` viejo tras mover ramas con el server corriendo**
  (visto 2026-07-18, PR #23): si el `next dev` estuvo corriendo mientras los
  archivos cambiaban por debajo (crear rama → merge → volver a `main`), el
  caché de build puede quedarse con CSS/tema viejo y el usuario ve la versión
  anterior aunque el código en disco sea el nuevo. Un hard refresh del
  navegador (`Ctrl+Shift+R`) suele alcanzar; si no, cortar el server, borrar
  `.next` (`Remove-Item -Recurse -Force .next`) y `npm run dev` de nuevo.
  Verificar siempre el disco primero (`git log` + `grep` del token nuevo en
  `globals.css`) antes de asumir que es el código.

## Fuentes de verdad (leer antes de tocar lógica de negocio)

- [`docs/architecture.md`](docs/architecture.md) — arquitectura, modelo de
  datos, reglas del semáforo de riesgo.
- [`docs/financial-logic.md`](docs/financial-logic.md) — fórmulas de
  gestión de riesgo (tamaño de posición, R:R, pérdida/ganancia máxima).
- [`src/utils/riskCalculations.ts`](src/utils/riskCalculations.ts) —
  implementación ejecutable de esas fórmulas (funciones puras). Dos modos
  comparten el mismo núcleo (`analizarConTamañoPosicion`): apalancamiento
  (crypto spot/futuros) y cantidad fija (acciones/CEDEARs). El % de riesgo
  se calcula sobre el capital invertido en la propia operación
  (`valorPosicion`), nunca sobre un balance de cuenta que el usuario tenga
  que tipear.
- [`supabase/schema.sql`](supabase/schema.sql) y las migraciones
  `002_auth_and_rls.sql` … `006_stop_loss_take_profit_opcionales.sql` —
  schema y políticas RLS reales, en orden de ejecución. Cuáles están
  corridas: memoria `project-supabase-state`. Cada migración nueva se corre
  como new query separada en el SQL Editor de Supabase.

## Estado actual (snapshot)

Detalle completo en las memorias (`MEMORY.md` → `project-overview` y
`project-session-history`). Resumen:

- Auth real con Supabase (email + contraseña, RLS por usuario) — ✅.
- **Nueva Operación** (Acciones/CEDEARs, Crypto Spot/Futuros, Plazo Fijo)
  — ✅ cerrada, validación de campos probada por el usuario.
- **Posiciones Abiertas** — ✅ 5 pestañas (Acciones, CEDEARs, Crypto
  Futuros, Crypto Spot, Plazos Fijos) + cerrar operaciones con P&L en vivo.
- **Historial**, **Dashboard**, **Portafolio** y **Multi-portafolio** — ✅.
- Precios reales (CoinGecko cripto + Yahoo Finance acciones/CEDEARs) — ✅.
- Verificación por email (confirmación de registro + recuperación de
  contraseña, con `verifyOtp`/`token_hash`) — ✅ en local; para producción ver
  el runbook.

**Despliegue gratuito y activación de mails:** guía paso a paso en
[`docs/despliegue-gratuito.md`](docs/despliegue-gratuito.md) (Vercel + Supabase
free + Resend; el único costo es el dominio para mandar a terceros).

**Próximo paso / decisiones abiertas:** ver `project-overview` y
`project-pending-decisions` en las memorias.
