# Suite de pruebas

Diseño completo y criterio de priorización:
[`docs/superpowers/specs/2026-07-29-suite-de-pruebas-design.md`](superpowers/specs/2026-07-29-suite-de-pruebas-design.md).

Hoy son **275 pruebas**: 186 unitarias, 18 de componentes, 66 de integración
contra Postgres y 5 flujos end-to-end.

## Cómo correrla

| Comando | Qué corre | Necesita Docker |
|---|---|---|
| `npm test` | Unitarios y componentes | No |
| `npm run test:sql` | Integración contra las RPC y RLS | Sí |
| `npm run test:e2e` | Los 5 flujos de Playwright | Sí |
| `npm run db:reset` | Recrea la base local desde las migraciones | Sí |

Para los dos últimos hace falta Supabase local levantado:

```
npm run db:start
```

Hay que correrlo cada vez que se reinicia Docker Desktop. La primera corrida de
E2E también necesita el navegador:

```
npx playwright install chromium
```

Los E2E levantan la app en el puerto **3100**, no en el 3000, así que se pueden
correr con un `npm run dev` propio abierto al lado.

## Cómo está organizada

- `tests/unit/` — lógica pura: fórmulas de riesgo, cuentas, importador.
- `tests/sql/` — las 6 RPC de saldos, RLS y el invariante contable.
- `tests/componentes/` — `useListaPaginada` y `RiskPanel`.
- `tests/e2e/` — flujos completos en navegador.
- `tests/setup/` — todo lo que habla con Supabase local.

Cada test SQL y cada test E2E crea su propio usuario: el aislamiento lo da RLS,
no un truncate entre tests, así que pueden correr en paralelo.

La configuración de Supabase local se consulta **una sola vez** por corrida
(`tests/setup/globalSetup.ts`). No invocar la CLI desde un archivo de test: con
varios workers en paralelo compiten por su archivo de telemetría y en Windows
uno falla con `FileSystem.rename`, tumbando un test al azar.

## Qué corre en CI

- Job **rápido** (en cada push): typecheck + `npm test`.
- Job **completo** (solo en pull requests): Supabase en Docker, migraciones,
  `test:sql`, `test:e2e`, y el reporte de Playwright como artefacto.

## Defectos conocidos

Los tests marcados con `test.fails(...)` describen el comportamiento **correcto**
de un defecto todavía sin arreglar. Cada uno referencia su ítem en la sección 9
del spec. Cuando el defecto se arregla, el test pasa de `test.fails` a `test` en
el mismo commit.

## Deuda conocida: lint fuera del CI

`npm run lint` todavía no corre en CI. Falla con 5 errores de
`react-hooks/set-state-in-effect` (los 4 contexts y `AssetAutocomplete`), todos
preexistentes en `main` y ajenos a la suite: son `useEffect` que llaman a
`cargar()`, que a su vez hace `setState` de forma síncrona. Se arreglan en un PR
aparte y recién ahí se suma el paso al workflow. Hay además un warning esperado
por el parámetro `_locale` de `sanitize.ts`, que es deliberado (ver defecto 9.6).

## Qué NO se prueba automatizado

El alcance negativo está en la sección 7 del spec, con su justificación. En
resumen: renderizado de Recharts, APIs de mercado reales, Supabase Auth por
dentro, estilos y regresión visual, vista móvil, el crash de traducción del
navegador, y concurrencia real entre dos clientes.
