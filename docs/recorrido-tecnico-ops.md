# Recorrido técnico — Gestor de Portfolio y Operaciones

De la creación de la suite de pruebas hasta la app en producción, y de ahí a su
mantenimiento: auditoría de seguridad, gestión de bugs y deuda de dependencias.
Documento de handoff: prácticas, tecnologías y procesos aplicados.

Período: 2026-07-26 → 2026-11-25. Repo: `Malu-gani/Registro-de-Operaciones`.
Producción: https://registro-de-operaciones-chi.vercel.app

---

## Línea de tiempo

### 0. Punto de partida (2026-07-26)

- El proyecto **no tenía ni una sola prueba automatizada**. Todo el QA era manual, en el navegador.
- Auditoría **Lighthouse** sobre `/cuenta` (Performance 84, Accesibilidad 91, Best Practices 100, SEO 100) y lectura con criterio: el 84 no era representativo porque se midió contra `next dev`, que a propósito no minifica ni hace tree-shaking. Para un número real hay que medir contra `next build && next start`.
- Las skills de sesión `/arranca` y `/cerrar` pasaron a ser **globales** (antes vivían dentro del repo), para tener la misma metodología de arranque y cierre en cualquier proyecto.

### 1. Diseño de la suite: primero el papel, después el código (2026-07-29)

- Flujo **brainstorming → spec → plan → ejecución**, con documentos versionados en el repo:
  - `docs/superpowers/specs/2026-07-29-suite-de-pruebas-design.md` (diseño)
  - `docs/superpowers/plans/2026-07-29-suite-de-pruebas.md` (plan de 16 tareas con el código de cada test)
- **Criterio de priorización P0–P3 por consecuencia de la falla**, no por facilidad de testear.
- **Alcance negativo explícito**: qué se decide NO probar y por qué. Es lo que separa una suite diseñada de una improvisada.
- **Pirámide con base ancha en unitario + SQL**, E2E chico y elegido (5 flujos). Decisión consciente contra "inflar E2E por vitrina".
- **pgTAP descartado con argumento**: prueba las funciones desde adentro de Postgres con permisos elevados, o sea que **RLS no se ejercita** — justo la capa de seguridad que había que verificar.

### 2. Entorno de pruebas real, no mockeado (2026-07-29)

- **Docker Desktop 4.84.0** instalado vía `winget` (backend WSL2).
- **Supabase CLI** como **devDependency** del proyecto (`npm i -D supabase`, v2.110.0) porque no existe en winget → se invoca con `npx supabase` y **la versión queda fijada en `package.json`**, así el CI usa exactamente la misma.
- Resultado: **Postgres local, efímero y limpio**, con `npm run db:start` / `npm run db:reset`. Decisión de fondo: base local en Docker **en vez de** un proyecto de test en la nube — permite ejercitar RLS con sesión de usuario real, y que la suite corra en cualquier máquina que clone el repo **sin secrets**.
- `scripts/aplicar-migraciones.mjs`: aplica `schema.sql` + migraciones `002…014` en orden contra la base local, **sin mover las migraciones de lugar** para no romper el flujo manual del SQL Editor.

### 3. Construcción de la suite: 16 tareas, 275 pruebas (2026-07-29)

- **Vitest** partido en proyectos `unit` y `sql`; **Testing Library** para componentes; **Playwright** para E2E.
- Números finales: **275 pruebas en verde** = 186 unitarios + 18 de componentes + 66 SQL + 5 E2E.
- **Aislamiento de datos por RLS, no por truncate**: cada test SQL crea su propio usuario con email único → corren **en paralelo sin pisarse**.
- **Técnica clave — tests de defectos conocidos escritos contra el comportamiento CORRECTO** y marcados `test.fails(...)` con el número de defecto. Nacen en rojo a propósito; cuando el defecto se arregla pasan a `test` en el mismo commit. Los arreglos van en **PRs aparte** del PR de la suite.
- **Condición de corte aplicada**: `CryptoForm` no se testea como componente porque depende de 4 contextos y sale a la red al renderizar — sería un test de integración de media app disfrazado. Sus 3 aserciones útiles **se movieron a E2E**. Saber cuándo NO testear en un nivel es parte del diseño.
- **Debugging sistemático de una intermitencia (caso de estudio):** un test al azar fallaba con 3+ archivos. Causa raíz: la CLI de Supabase escribe `~/.supabase/telemetry.json` con temporal+rename, y los workers en paralelo competían por ese rename (en Windows uno falla). Fix: un **`globalSetup`** que la consulta **una sola vez** antes de los workers. No se parchearon síntomas.
- PRs: **#31** (tareas 1–14, 270 tests) y **#32** (tareas 15–16: E2E + CI completo + `docs/testing.md`), ambos mergeados.

### 4. La suite encontró 10 defectos reales — y se arreglaron los 10 (2026-07-29)

- **Familia P0 — las RPC de Postgres confiaban en el cliente.** Son `security definer` y están otorgadas a `authenticated`, así que cualquier usuario logueado las llamaba directo con `supabase.rpc()` **salteándose el formulario**:
  - **9.1 `abrir_operacion` creaba dinero**: con cantidad negativa el costo daba negativo, la guarda `if disponible < costo` pasaba siempre y la resta **sumaba**. Medido: **1.000 USD → 101.000 en una sola llamada**.
  - **9.5 `cerrar_operacion` aceptaba precio de salida negativo**: en un short inflaba el P&L; en un long dejaba el saldo **en −6.000**, rompiendo la invariante `disponible >= 0` que el resto del sistema defiende.
- **Lección metodológica:** los defectos se habían deducido **leyendo** el código. Correrlos contra una base real **cambió tres severidades** (uno bajó de P0 a P3 porque un `check (monto > 0)` de columna lo frenaba, otro resultó **peor** de lo previsto, y un tercero se midió distinto de lo estimado). Conclusión: *el análisis estático acierta el **dónde** y falla el **cuánto***.
- **Defensa en profundidad:** además de validar en la RPC se agregaron **`check` de columna** en `operaciones`, replicando lo que `plazos_fijos` ya tenía y que fue justo lo que evitó que un defecto fuera grave.
- **9.10 — el repo no era autosuficiente para recrear la base.** Ni el schema ni ninguna migración otorgaba `grant` explícitos: el proyecto **heredaba los permisos por defecto del entorno**. Funcionaba en la nube y por eso nunca se notó; en una base limpia toda la app era invisible para sus propios usuarios. Se aprendió a distinguir dos capas que se confunden: **RLS devuelve vacío, un `grant` faltante tira error**.
- Otros: huso horario en el vencimiento de plazos fijos, fecha de salida anterior a la de entrada, separador de miles por locale (`es-AR`), fechas inexistentes tipo `2026-02-31`, dos fórmulas de riesgo que se contradecían, y el `0` tratado como "sin stop loss".
- **PRs de arreglo #33, #34, #35, #36, #37** con **migraciones 015, 016 y 017** corridas en la nube. Gotcha de versionado: la `016` quedó tomada por un PR, así que otro defecto **se renumeró a `017`** — el orden de migraciones importa.

### 5. CI/CD y calidad automatizada (2026-07-29)

- **GitHub Actions** (`.github/workflows/ci.yml`) con **dos jobs**:
  - **`rapido`** — typecheck + tests unitarios + lint, en cada push.
  - **`completo`** — SQL + E2E, **solo en pull requests** (`if: github.event_name == 'pull_request'`), porque levanta su propio Supabase con Docker en el runner.
- **El CI levanta su propio Docker en `ubuntu-latest`**: no depende de la máquina local ni de tener Docker prendido.
- **Lint saldado (PR #38):** de **161 errores a 0**. **156 eran ruido** de un archivo generado por la CLI (`supabase/.temp/` → a `globalIgnores`); de los **5 reales**, uno era un anti-patrón genuino (`AssetAutocomplete` reseteaba estado derivado en un `useEffect` → se movió a la fase de render) y **4 eran fetch-al-montar legítimo** → `eslint-disable` **acotado y comentado**, sin tocar la lógica. Distinguir ruido de señal antes de refactorizar.
- **Decisión de scope registrada:** el lint quedó fuera del CI en el PR de la suite a propósito (esos errores ya estaban en `main`, no los trajo la suite) y se saldó **en su propio PR** después.

### 6. Verificación por email (PR #39, 2026-07-29)

- Confirmación de registro (con reenvío) + recuperación de contraseña.
- **Decisión de arquitectura con fundamento: se descartó PKCE, se usa `verifyOtp` + `token_hash`.** El PKCE guarda el `code_verifier` en un cookie del navegador donde se **inició** el flujo, así que confirmar el mail **desde otro dispositivo** (registrás en la PC, abrís el mail en el celu) fallaba. `token_hash` no depende de cookies previos. Implicó plantillas de mail propias + un route handler `/auth/confirm`.
- **Bug de producto que encontraron los tests** (nadie hubiera podido confirmar su email): el callback perdía la sesión porque las cookies se escribían en el store de `next/headers` y **no sobrevivían al `NextResponse.redirect`**; y el redirect usaba el `origin` de `request.url`, que `next start` reporta como `localhost`. Fix: escribir las cookies **sobre la respuesta** + armar el redirect con `NEXT_PUBLIC_SITE_URL`.
- **Infra de test adaptada:** activar la confirmación rompía los 5 E2E viejos (asumían confirmación apagada) → se integró **Mailpit** (atrapa-mails local de Supabase, `:54324`) con un helper propio. **9 E2E en verde**.

### 7. Despliegue a producción, costo $0 — Fases A, B y C (2026-07-29/30)

- **La pregunta ordenó todo:** antes de desplegar se definió si se podía dejar **todo funcional sin costo**. Respuesta: sí, dado el escenario real de uso (el dueño + 2-3 conocidos, nunca desconocidos).
- **Hallazgo que cambió el plan: Resend sin dominio verificado NO sirve** para mandarle mail a un tercero — solo permite mandarte a tu propia casilla. El runbook original (Resend + dominio ~USD 10/año) no era el camino.
- **Runbook reescrito en 3 fases** (`docs/despliegue-gratuito.md`): **A** = hosting solo para el dueño, **B** = conocidos con **Gmail como SMTP** (2FA + contraseña de aplicación, ~500 mails/día, gratis), **C** = público con Resend + dominio, solo si algún día se abre a desconocidos.
- **Fase A — Vercel plan Hobby**, repo conectado por GitHub, *Production* sigue `main` → **cada merge redeploya solo**, y **cada PR recibe su propia URL de Preview**.
- **Gotchas de Vercel aprendidos en carne propia:**
  - `Environment Variables` (la que sirve) vs `Environments` (crear entornos tipo staging — **es Pro/paga y no hace falta**).
  - `NEXT_PUBLIC_SITE_URL` se **incrusta en el build**: agregarla después del primer deploy exige **Redeploy sin build cache**. Guardarla no alcanza.
  - La URL va **sin barra final**.
- **Manejo de secrets:** el proyecto usa el **formato nuevo** de claves de Supabase (`sb_publishable_…`, reemplazo de la vieja `anon`). Se verificó **leyendo el prefijo del `.env.local`** en lugar de adivinar. Regla: **nunca** una `sb_secret_…` en una variable `NEXT_PUBLIC_` — saltea el RLS.
- **Fase B — mails propios verificados cross-device**, abriendo los links **desde el celular** (el caso exacto que rompía el PKCE). Las plantillas se cargaron **a mano en el dashboard de la nube** porque el proyecto cloud **no lee** el `supabase/config.toml` local.
- **Decisión de orden reusable en cualquier despliegue:** probar **recuperación de contraseña ANTES** de activar `Confirm email`. La recuperación no puede dejar a nadie afuera; activar la confirmación con el SMTP mal configurado deja al usuario nuevo **sin poder entrar nunca**.
- **Truco de testing sin crear casillas:** `tu.email+prueba@gmail.com` — Gmail ignora lo que sigue al `+`, Supabase lo toma como usuario distinto.
- **Verificación, no confianza:** se comprobó en el navegador que `/auth/confirm` sin token redirige al dominio de Vercel y **no** a `localhost` — prueba indirecta de que `SITE_URL` entró en el build (todas sus lecturas son server-side, no se ven en el bundle).

### 8. Prácticas de proceso que atraviesan todo

- **Workflow git rama → PR → merge**, un PR por unidad de trabajo, con la verificación escrita **adentro** del PR. Nunca commits automáticos sin pedido.
- **Gotcha de git real:** pushear commits a la rama de un **PR ya mergeado** no los agrega al PR — quedan **huérfanos en silencio**. Regla adoptada: verificar el `state` del PR antes, y confirmar después del push con `git merge-base --is-ancestor <sha> origin/main`.
- **Gotcha de PRs apilados:** mergear el PR base con `--delete-branch` hace que GitHub **cierre** el PR hijo en vez de reapuntarlo a `main`.
- **Debugging sistemático antes de tocar nada** ante cualquier test que falle. Evitó dos parches equivocados en una sola sesión. Y la contracara: cuando una intermitencia apareció **una vez** y no se pudo reproducir en 6 corridas seguidas, **no se tocó nada sin evidencia**.
- **Memoria de proyecto persistente** (índice + archivos por tema) + skills `/arranca` y `/cerrar` para que cada sesión empiece con contexto y termine auditada.
- **Documentación versionada con el código**: `docs/architecture.md`, `docs/financial-logic.md`, `docs/testing.md`, `docs/despliegue-gratuito.md`, specs y planes.

### 9. Gestión de bugs y user stories en Notion (desde 2026-08-08)

- Los bugs y las historias de usuario se llevan en un gestor de Notion con prefijo propio (`OPS-BUG-NN` / `OPS-US-NN`), con criterios de aceptación y sub-tareas. Cada ticket tiene estado (`Reportado` / `En Progreso` / `Resuelto`), fechas de inicio y fin, y una nota de finalización.
- **Un fix no cierra el ticket por sí solo.** Un ticket pasa a `Resuelto` cuando el cambio está mergeado **y** validado en uso real; si queda algo por confirmar, queda `En Progreso` con registro de qué falta.
- Los fixes se hacen con **TDD**: el test que reproduce el bug nace en rojo y pasa en el mismo commit que el arreglo. Un bug de fecha (la fecha "de hoy" calculada en UTC en vez de hora local, un día adelantada de noche en Argentina) se cerró con un test de relojes falsos que reproduce el horario exacto, sin depender de una validación manual.
- Un fix de producto puede romper tests E2E que asumían el comportamiento viejo (pasó con el modal de confirmación de "Editar saldos"); lo atrapó el CI del PR, no el QA manual.
- Se agregó una migración (`018`) para liquidar plazos fijos con rentabilidad personalizada. Se dropeó la función vieja antes de recrearla porque `CREATE OR REPLACE` no reemplaza una función cuando cambian los tipos de sus parámetros.

### 10. Auditoría de seguridad del repo público (2026-08-10 → 2026-08-14)

- **Disparador:** el repo quedó público al publicar el portfolio. Se auditaron todos los commits y PRs buscando secretos filtrados: **149 commits, ninguno con secretos**, `.env.local` nunca trackeado, sin secrets en el CI.
- **Open redirect explotable (PR #47).** `/auth/callback` y `/auth/confirm` redirigían al parámetro `next` sin validarlo. Con `next=@evil.com` y una base sin barra final, la URL resultante deja `evil.com` como **host** y el resto como *userinfo*. Fix: una función que solo acepta rutas internas y rechaza `@host`, `//host`, `/\host` (los navegadores normalizan la barra invertida) y cualquier URL absoluta.
- **Defensa en profundidad (PR #48).** `/api/market/*` ahora responde un 401 propio, con `getUser()` y no `getSession()`, en vez de depender de la forma de rechazo del middleware. Y los errores crudos de Supabase dejaron de llegar a la UI.
- **Un hallazgo mal reportado se corrigió antes de commitear.** Primero se dijo que `/api/market/*` estaba sin autenticar; verificando el matcher del middleware contra la ruta real se vio que ya bloqueaba anónimos. El PR pasó de "cierra un agujero" a "agrega defensa en profundidad", y se corrigió el comentario, el test y la descripción del PR.
- **Dependencias (PR #54, 2026-10-30).** Next 16.2.10 → 16.4.3, que cerraba 5 vulnerabilidades críticas de ejecución remota y un bypass del middleware, o sea el núcleo del control de acceso.

### 11. Advisors de Supabase y migraciones 019 a 021 (2026-10-30)

- Se cruzaron las advertencias del Security y del Performance Advisor contra el SQL del repo **en vez de creerle al título del lint**. De las 17 de seguridad, las 8 de `anon` no eran explotables y las 9 de `authenticated` eran el diseño buscado; igual se taparon, porque el patrón ya existía.
- **019:** revoca `EXECUTE` de `public` y `anon` en las funciones (Postgres lo otorga a `PUBLIC` por defecto) y lo re-otorga solo a `authenticated`.
- **020:** envuelve `auth.uid()` como `(select auth.uid())` en las 20 políticas RLS de las 6 tablas (optimización InitPlan: se evalúa una vez por consulta, no una vez por fila).
- **021:** índices sobre las claves foráneas de las tablas que crecen (el primer `create index` del repo). Se verificó **reproduciendo la lógica del propio Advisor contra la base local**.
- **Verificación en la base real (2026-11-25):** con autorización previa, consultas **de solo lectura** confirmaron que las migraciones 019 a 021 quedaron aplicadas en la nube.
- **Una recomendación inviable, dicha tal cual:** la protección contra contraseñas filtradas es solo del plan Pro. Se redirigió a los ajustes gratuitos que sí importaban (política de contraseñas del servidor alineada con la del cliente).
- **Gotcha:** `npm test` excluye el proyecto `sql`. Un 254/254 en verde no dice nada sobre una migración; para eso va `npm run test:sql`.

### 12. OPS-BUG-01: seis intentos y una lección de método (2026-08 → 2026-10-30)

- **El bug:** formularios con campos superpuestos o aplastados en pantallas Android reales.
- **Los primeros cinco intentos fueron diagnósticos deducidos desde los síntomas, sin medir.** Cuatro decidían las columnas por ancho (media query, container queries, `ResizeObserver`, el menor entre contenedor y ventana); el quinto puso una columna siempre. De ahí salió la conclusión "en esos Android ninguna medida de ancho es confiable", escrita en los comentarios del código con total convicción, y **era falsa**.
- **Causa real:** `col-span-2` sobrevivientes en campos dentro de un `grid-cols-1`. La celda pide dos columnas, el grid declara una y el navegador **crea una segunda columna implícita** que se come el espacio de la primera. Medido en Chrome sobre 344 px útiles: el campo mide 344 px sin el `col-span` y 157 px con él. No depende del dispositivo.
- **Qué lo destrabó:** que el reporte se desglosara por zona de la pantalla ("el panel de riesgo quedó abajo, pero el formulario se sigue viendo mal"), lo que probó que había dos grids distintos. Y después, abrir un navegador y medir dos elementos: tardó diez minutos.
- **Test de regresión que lee el código fuente.** jsdom no calcula layout, así que no puede observar una columna implícita ni con el DOM correcto. Se fijó la **regla** ("mientras el grid sea de una columna, `col-span` no puede aparecer en estos archivos") y no el síntoma.
- El PR también **corrigió los comentarios falsos**: una explicación equivocada en el código es peor que ninguna.
- El ticket se cerró recién cuando el dueño confirmó en su celular que se veía bien, no cuando el CI quedó en verde.

### 13. Deuda de dependencias (2026-11-24 → 2026-11-25)

- **Next 16.4.3 → 16.4.6 (PR #57)** por 7 avisos moderados. Antes de actualizar se revisó si el código usaba las funciones afectadas (`use cache`, `next/image`, Edge): no, riesgo bajo. Después se comprobó a mano el login, la navegación y el flujo de Nueva Operación.
- **vitest 3.2.7 → 4.1.12 (PR #58)** por 2 críticos de desarrollo. El ticket pedía la versión 5, pero **el repo estaba en la 3, no en la 4**, y `npm audit` indicaba "salto mayor a 5.1.1". Simulado en una copia temporal: la 4.1.12 ya cierra los críticos (dejó de depender de `tinypool`) y la 5.1.1 ni instala (conflicto de dependencias). Lección: **verificar en una copia temporal, no creerle al `fixAvailable` de `npm audit`**. Se mergeó con 258 pruebas unitarias y de componentes y 70 SQL en verde (la suite SQL, 4 veces seguidas sin intermitencia), build y lint.
- **Un PR por cambio de dependencias**, sin mezclarlos con otros cambios, para poder revertir uno sin tocar el resto.
- **Limpieza de ramas verificada contra los PRs.** Se borraron 43 ramas (16 locales y 27 remotas) verificando cada una con `gh pr list --head` y no con `git branch --merged`, que con squash-merge las reporta como no mergeadas.
- **Qué queda:** 15 avisos de `npm audit` (0 críticos, 7 altos), un `npm audit fix` pendiente sobre dependencias transitivas y evaluar vitest 5 cuando sus dependencias lo permitan.

---

## Inventario de tecnologías y prácticas

**Testing:** Vitest (proyectos `unit` + `sql`) · Testing Library · Playwright (E2E) · Mailpit para verificar mails en tests · `test.fails()` para defectos conocidos · aislamiento por RLS con usuarios únicos · `globalSetup` para recursos compartidos · diseño con priorización P0–P3 y alcance negativo explícito.

**Infra local:** Docker Desktop (WSL2) · Supabase CLI como devDependency versionada · Postgres efímero con migraciones aplicadas por script · `db:start` / `db:reset`.

**CI/CD:** GitHub Actions con jobs separados por costo (rápido en push / completo solo en PR) · Docker levantado **dentro del runner** · typecheck + lint + tests como puertas de calidad · deploy continuo Vercel desde `main` · Preview deployments por PR.

**Cloud / deploy:** Vercel Hobby · Supabase (Postgres + Auth + RLS + RPC `security definer`) · Gmail SMTP · gestión de variables de entorno y de la diferencia **build-time vs runtime** · higiene de secrets (`NEXT_PUBLIC_` vs secret key) · costo total **$0**.

**Seguridad:** RLS ejercitada de verdad (un usuario B no ve ni toca nada de A, ni por lectura, ni por escritura directa, ni por RPC) · validación server-side en las RPC · `check` de columna como defensa en profundidad · `grant` explícitos para que el repo recree la base · ledger de movimientos append-only **incluso para el dueño**.

**Stack de la app:** Next.js 16 · TypeScript · Tailwind v4 · Supabase (Postgres / Auth / RLS) · Recharts · Server Actions / Route Handlers (sin backend propio).

**Gestión:** tickets de bugs y user stories con criterios de aceptación y estados · TDD en los fixes · un PR por cambio · verificación en una copia temporal antes de actualizar dependencias · diagnóstico midiendo en vez de deducir.

**Números:** al cierre de julio, 275 pruebas (186 unit + 18 componentes + 66 SQL + 5 E2E, luego 9 E2E) · 10 defectos encontrados y **10 arreglados** · 2 de severidad P0 que permitían **crear dinero** · lint de 161 → 0 errores. Al 2026-11-25: 258 pruebas unitarias y de componentes + 70 SQL (más los E2E) · 21 migraciones SQL versionadas · PRs #31 a #58 · 1 vulnerabilidad explotable propia (open redirect) cerrada · `npm audit` en 15 avisos, 0 críticos.
