# Lint limpio y en CI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar `npm run lint` en cero errores y sumarlo al job rápido del CI, sin cambiar el comportamiento de la app.

**Architecture:** Tres frentes independientes. (1) ESLint estaba linteando un archivo generado por la CLI de Supabase (`supabase/.temp/`) — se ignora. (2) `AssetAutocomplete` resetea estado derivado dentro de un `useEffect`; es un anti-patrón real y se arregla moviendo el reset a la fase de render (patrón soportado por React). (3) Los 4 contexts hacen fetch de datos al montar / al cambiar de portafolio activo; eso es un uso legítimo de `useEffect` que la regla `react-hooks/set-state-in-effect` marca como falso positivo — se silencia con un `eslint-disable-next-line` acotado y justificado, sin tocar la lógica.

**Tech Stack:** ESLint 9 (flat config, `eslint.config.mjs`) + `eslint-config-next` · React 19 (regla `react-hooks/set-state-in-effect`) · Next.js 16 · Vitest (proyecto `unit`) · GitHub Actions (`.github/workflows/ci.yml`).

## Global Constraints

- Comentarios y textos de UI **en español** (proyecto en español, dueño no técnico).
- **Sin firma de Claude** en commits (ni `Co-Authored-By`, ni menciones de IA).
- **No cambiar el comportamiento** observable de la app: no hay tests que cubran la carga de datos de los contexts, así que los cambios en ellos deben ser inertes (solo silenciar la regla) o derivaciones puras equivalentes.
- El comando de verdad es **`npm run lint`** (debe terminar en 0 errores) y **`npm test`** (no debe romperse ningún test existente) y **`npm run typecheck`**.
- Node 22 en CI (ya fijado en `ci.yml`).

---

### Task 1: Ignorar el archivo generado por la CLI de Supabase

El 97% de los errores (`no-var`, `prefer-const` en la línea 1 con columnas gigantes) vienen de `supabase/.temp/start-secrets/.../main/index.ts`, un artefacto que crea `npx supabase start`. Ya está en `supabase/.gitignore` (no se versiona), pero ESLint no lee `.gitignore` en flat config, así que hay que ignorarlo explícito.

**Files:**
- Modify: `eslint.config.mjs:9-15` (el `globalIgnores`)

**Interfaces:**
- Consumes: nada.
- Produces: nada que consuman otras tareas. Deja el resto del lint reducido a 5 errores en 5 archivos de `src/`.

- [ ] **Step 1: Ver el estado actual del lint (línea base)**

Run: `npm run lint 2>&1 | grep -cE "error"`
Expected: un número grande (al momento de escribir el plan, **161**). Anotarlo.

- [ ] **Step 2: Agregar `supabase/.temp/**` a los ignores de ESLint**

En `eslint.config.mjs`, dentro del array de `globalIgnores([...])`, agregar la entrada (con su comentario en español):

```js
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefactos generados por la CLI de Supabase (`npx supabase start`). No es
    // código del proyecto y ya está en supabase/.gitignore; ESLint no lee el
    // .gitignore en flat config, así que hay que ignorarlo acá también.
    "supabase/.temp/**",
  ]),
```

- [ ] **Step 3: Verificar que quedan solo los 5 errores reales**

Run: `npm run lint 2>&1 | grep -E "\.(ts|tsx)$" | sort -u`
Expected: exactamente estos 5 archivos, ninguno de `supabase/.temp/`:
```
.../src/components/AssetAutocomplete.tsx
.../src/context/CuentasContext.tsx
.../src/context/PlazosFijosContext.tsx
.../src/context/PortafoliosContext.tsx
.../src/context/TradesContext.tsx
```

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore(lint): ignorar los artefactos de supabase/.temp"
```

---

### Task 2: `AssetAutocomplete` — resetear estado derivado en render, no en el effect

`useEffect` en `AssetAutocomplete.tsx:38` hace, como primera cosa, un `setActivoSeleccionado(null)` / `setPrecioActual(null)` cuando el `value` tipeado dejó de coincidir con el activo elegido. Eso es "ajustar estado cuando cambia una prop", que React recomienda hacer **durante el render**, no en un effect. El resto del effect (la búsqueda con debounce) se queda como está.

**Files:**
- Modify: `src/components/AssetAutocomplete.tsx:38-50` (sacar el reset del effect, ponerlo antes del effect en el cuerpo del componente)

**Interfaces:**
- Consumes: nada de otras tareas.
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Confirmar el error actual (línea base del archivo)**

Run: `npm run lint 2>&1 | grep -A1 "AssetAutocomplete"`
Expected: un `error ... react-hooks/set-state-in-effect` apuntando a la línea 40 (`setActivoSeleccionado(null)`).

- [ ] **Step 2: Mover el reset a la fase de render**

En `src/components/AssetAutocomplete.tsx`, **quitar** las líneas del reset de adentro del `useEffect`:

```js
  useEffect(() => {
    if (activoSeleccionado && value !== activoSeleccionado.symbol) {
      setActivoSeleccionado(null);
      setPrecioActual(null);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
```

y dejar el effect empezando directamente en el `clearTimeout`:

```js
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
```

Después, **agregar el reset durante el render**, justo antes de ese `useEffect` (después de las declaraciones de estado y el `debounceRef`):

```js
  // Si el usuario editó el texto y ya no coincide con el activo elegido, el
  // activo deja de estar seleccionado. React soporta ajustar estado derivado
  // durante el render (re-renderiza sin llegar a pintar); es la alternativa
  // recomendada a hacerlo en un useEffect. No hay loop: tras el reset,
  // activoSeleccionado es null y la condición ya no se cumple.
  if (activoSeleccionado && value !== activoSeleccionado.symbol) {
    setActivoSeleccionado(null);
    setPrecioActual(null);
  }
```

- [ ] **Step 3: Verificar que ese archivo ya no da error de lint**

Run: `npm run lint 2>&1 | grep "AssetAutocomplete" || echo "SIN ERRORES en AssetAutocomplete"`
Expected: `SIN ERRORES en AssetAutocomplete`.

- [ ] **Step 4: Verificar typecheck y que no se rompió ningún test**

Run: `npm run typecheck && npm test`
Expected: typecheck sin errores; todos los tests unitarios/componentes en verde (el comportamiento del reset es equivalente; la búsqueda con debounce quedó intacta).

- [ ] **Step 5: Commit**

```bash
git add src/components/AssetAutocomplete.tsx
git commit -m "fix(AssetAutocomplete): resetear el activo elegido en render, no en el effect"
```

---

### Task 3: Los 4 contexts — silenciar el falso positivo del fetch-al-montar

`CuentasContext`, `TradesContext`, `PlazosFijosContext` y `PortafoliosContext` cargan datos del servidor al montar y cuando cambia el portafolio activo. La regla marca el `setState` síncrono (el `setLoading(true)` / `setError(...)` de config), pero este ES el caso legítimo de effect: sincronizar con un sistema externo (la base) al montar. La alternativa "correcta" sería una librería de data-fetching (SWR/React Query), que es una dependencia y un refactor grande fuera del alcance de "dejar el lint verde". Se silencia con un disable **acotado a la línea** y comentado, sin tocar la lógica de carga (que además no tiene tests que la respalden).

**Files:**
- Modify: `src/context/CuentasContext.tsx:76-78` (la línea `cargar();` del effect)
- Modify: `src/context/TradesContext.tsx:64-66` (la línea `cargar();` del effect)
- Modify: `src/context/PlazosFijosContext.tsx:54-56` (la línea `cargar();` del effect)
- Modify: `src/context/PortafoliosContext.tsx:40-47` (la línea `setError(...)` del branch de config, dentro del effect)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Confirmar las 4 líneas marcadas (línea base)**

Run: `npm run lint 2>&1 | grep -E "Context\.tsx:[0-9]+:[0-9]+$"`
Expected: 4 rutas, una por context, apuntando a: `CuentasContext.tsx:77`, `PlazosFijosContext.tsx:55`, `PortafoliosContext.tsx:42`, `TradesContext.tsx:65` (los números pueden correrse un par de líneas; lo que importa es que sea una por archivo).

- [ ] **Step 2: `CuentasContext` — disable acotado**

En `src/context/CuentasContext.tsx`, el effect (~línea 76) queda así:

```js
  // Carga inicial y recarga al cambiar de portafolio activo. Es el caso legítimo
  // de useEffect: sincronizar con un sistema externo (Supabase) al montar. La
  // regla lo marca por el setState síncrono del estado de carga/config; la
  // alternativa sería una librería de data-fetching (SWR), fuera de alcance acá.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar, ver comentario arriba
    cargar();
  }, [cargar]);
```

- [ ] **Step 3: `TradesContext` — mismo disable**

En `src/context/TradesContext.tsx`, el effect (~línea 64):

```js
  // Carga inicial y recarga al cambiar de portafolio activo. Es el caso legítimo
  // de useEffect: sincronizar con un sistema externo (Supabase) al montar. La
  // regla lo marca por el setState síncrono del estado de carga/config; la
  // alternativa sería una librería de data-fetching (SWR), fuera de alcance acá.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar, ver comentario arriba
    cargar();
  }, [cargar]);
```

- [ ] **Step 4: `PlazosFijosContext` — mismo disable**

En `src/context/PlazosFijosContext.tsx`, el effect (~línea 54):

```js
  // Carga inicial y recarga al cambiar de portafolio activo. Es el caso legítimo
  // de useEffect: sincronizar con un sistema externo (Supabase) al montar. La
  // regla lo marca por el setState síncrono del estado de carga/config; la
  // alternativa sería una librería de data-fetching (SWR), fuera de alcance acá.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar, ver comentario arriba
    cargar();
  }, [cargar]);
```

- [ ] **Step 5: `PortafoliosContext` — disable en la línea del setError de config**

En `src/context/PortafoliosContext.tsx` el effect no llama a un `cargar()`: hace el fetch inline con `.then()` (async, no marca) y lo único síncrono es el `setError(...)` del branch "Supabase no configurado" (~línea 42). El disable va sobre esa línea. Antes del `useEffect`, agregar el comentario explicativo, y sobre el `setError` el disable:

```js
  // Carga inicial de portafolios al montar (caso legítimo de useEffect:
  // sincronizar con Supabase). El fetch va por .then() (async, no marca); lo
  // único síncrono es el aviso de "Supabase no configurado" de abajo.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- aviso de config al montar, ver comentario arriba
      setError(
        "Supabase no está configurado. Complete .env.local con NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY y reinicie el servidor (npm run dev)."
      );
      setLoading(false);
      return;
    }
```

Nota: alcanza con el disable en la línea del `setError`; el `setLoading(false)` de la línea siguiente queda cubierto porque la regla marca por la primera aparición del patrón en el bloque. Si tras correr el lint (Step 6) apareciera un error en el `setLoading(false)`, mover el `eslint-disable-next-line` para que quede inmediatamente encima de la primera de las dos líneas que ESLint señale.

- [ ] **Step 6: Verificar que el lint quedó en CERO**

Run: `npm run lint`
Expected: termina sin errores (exit 0, sin salida de errores). Si quedara alguno en `PortafoliosContext`, aplicar la nota del Step 5.

- [ ] **Step 7: Verificar typecheck y tests (nada cambió de comportamiento)**

Run: `npm run typecheck && npm test`
Expected: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add src/context/CuentasContext.tsx src/context/TradesContext.tsx src/context/PlazosFijosContext.tsx src/context/PortafoliosContext.tsx
git commit -m "chore(lint): marcar los fetch-al-montar de los contexts como uso legítimo"
```

---

### Task 4: Sumar `npm run lint` al CI y documentarlo

Con el lint en verde, se agrega el paso al job `rapido` de `ci.yml` (que ya corre en cada push), se saca el comentario que explicaba por qué no estaba, y se actualiza `docs/testing.md`.

**Files:**
- Modify: `.github/workflows/ci.yml:23-33` (agregar el paso `Lint`, borrar el comentario viejo)
- Modify: `docs/testing.md` (la parte que dice que lint no está en CI)

**Interfaces:**
- Consumes: el lint en cero de las Tasks 1-3.
- Produces: nada.

- [ ] **Step 1: Agregar el paso de lint en `ci.yml`**

En `.github/workflows/ci.yml`, dentro del job `rapido`, reemplazar el bloque del comentario (`# `npm run lint` NO está en el CI todavía ...`) por un paso real, ubicado entre `Typecheck` y `Tests unitarios`:

```yaml
      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Tests unitarios
        run: npm test
```

- [ ] **Step 2: Actualizar `docs/testing.md`**

Buscar en `docs/testing.md` la mención a que `npm run lint` quedó fuera del CI (los errores de `react-hooks/set-state-in-effect`) y reemplazarla por una nota de que ya está integrado en el job rápido. Ejemplo de redacción:

> `npm run lint` corre en el job rápido del CI. ESLint ignora `supabase/.temp/`
> (artefactos de la CLI). Los fetch-al-montar de los 4 contexts llevan un
> `eslint-disable-next-line react-hooks/set-state-in-effect` justificado: son el
> caso legítimo de `useEffect` (sincronizar con Supabase al montar).

Ajustar el texto exacto al estilo del documento (leerlo antes de editar).

- [ ] **Step 3: Verificación local completa (lo que va a correr el CI)**

Run: `npm run typecheck && npm run lint && npm test`
Expected: los tres en verde.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml docs/testing.md
git commit -m "ci: sumar el paso de lint al job rápido"
```

- [ ] **Step 5: Push, abrir PR y confirmar el CI en verde**

```bash
git push -u origin <rama>
gh pr create --base main --title "ci: lint limpio y en el pipeline" --body-file <archivo>
```
Esperar a que el workflow `CI` termine en verde en el PR (incluido el nuevo paso `Lint` y el job `completo` de SQL/E2E que corre en PRs).

---

## Notas de alcance (fuera de este plan)

- **Posible race condition en los contexts:** al cambiar rápido de portafolio activo, dos fetches en vuelo podrían resolverse fuera de orden y pintar datos viejos. No se aborda acá (es un arreglo de lógica sin tests que lo respalden, y excede "dejar el lint verde"). Candidato a un PR propio con su test de regresión.
- **Migrar a SWR/React Query:** eliminaría de raíz los disables de la Task 3, pero es una dependencia nueva y un refactor de la capa de datos. YAGNI para este objetivo.
