# Suite de pruebas

Hoy son **275 pruebas**: 186 unitarias, 18 de componentes, 66 de integración
contra Postgres y 5 flujos end-to-end.

## Criterio de priorización

Las pruebas se ordenan por **consecuencia de la falla**, no por facilidad de
escritura. En una app que calcula riesgo, el peor escenario no es que algo se
rompa: es que devuelva un número plausible y equivocado.

| Nivel | Consecuencia | Dónde vive |
|---|---|---|
| **P0** | Se crea, se destruye o se contabiliza mal el dinero. Un usuario ve datos de otro. | Las 6 RPC de `008_funciones_saldos.sql`, políticas RLS |
| **P1** | Un número mal calculado informa una decisión de trading real. | `riskCalculations.ts`, `cuentas.ts`, FIFO del importador |
| **P2** | La UI muestra mal algo correcto, o deja cargar algo inválido. | Validación de formularios, `useListaPaginada`, chips de filtro |
| **P3** | Cosmético: color, espaciado, tema. | Fuera de alcance automatizado |

Regla operativa: ningún test P2 se escribe mientras quede un camino P0 sin
cubrir. Eso explica la forma de la pirámide — base ancha en unitario y SQL,
E2E deliberadamente chico.

La cobertura se reporta pero **no es umbral bloqueante**: un mínimo de cobertura
premia tests de relleno, y el criterio real es esta tabla.

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

Los defectos detectados al diseñar la suite se cubrieron con tests escritos
contra el comportamiento **correcto**, no contra el que tenía la app. Nacen en
rojo a propósito, marcados con `test.fails(...)`: una suite que nace verde sobre
un bug lo convierte en especificación. El arreglo va en un PR aparte del de la
suite, y ahí el test pasa de `test.fails` a `test` en el mismo commit.

Hoy no queda ninguno: los 10 defectos que encontró la suite están arreglados.
Si aparece uno nuevo, se documenta con esta misma técnica.

### Los 10 defectos

Los IDs `9.x` son los que citan los comentarios de los tests y las cabeceras de
las migraciones 015–017. Se conservan aunque estén todos cerrados, porque son la
trazabilidad entre el test, el arreglo y la migración.

| ID | Defecto | Sev. | Arreglo |
|---|---|---|---|
| 9.1 | `abrir_operacion` crea dinero con cantidad o precio negativos: el costo da negativo, la guarda `if disponible < costo` pasa siempre y la resta suma. Medido: 1.000 USD → 101.000 en una llamada. | **P0** | 015 |
| 9.5 | `cerrar_operacion` acepta precio de salida negativo: en un short infla el P&L, en un long deja el disponible en −6.000 y rompe la invariante `disponible >= 0`. | **P0** | 015 |
| 9.3 | `plazoFijoVencido` compara la fecha local contra UTC: el vencimiento se adelanta o atrasa un día según la hora. | P1 | 015 |
| 9.6 | `parseNumeroLocale` interpreta `"1.234"` como 1,234 en vez de mil doscientos treinta y cuatro. | P1 | 016 |
| 9.10 | El esquema no otorga permisos de tabla explícitos. Funcionaba en la nube por herencia del entorno; en una base limpia la app entera es invisible para sus propios usuarios. | P1 (latente) | 017 |
| 9.4 | `cerrar_operacion` acepta fecha de salida anterior a la de entrada. | P2 | 016 |
| 9.7 | `parseFecha` acepta fechas inexistentes como `2026-02-31`. | P2 | 016 |
| 9.8 | `calcularRatioRiesgoBeneficio` contradice al núcleo de cálculo: dos fórmulas distintas para lo mismo. | P2 | 016 |
| 9.9 | `if (precioStopLoss)` trata el `0` como "sin stop loss". | P2 | 016 |
| 9.2 | `abrir_plazo_fijo` filtra un error crudo de Postgres a la interfaz. | P3 | 015 |

**Las severidades cambiaron al ejecutarlos.** Los 10 se dedujeron *leyendo* el
código, antes de escribir un test. Correrlos contra una base real corrigió tres
cosas: 9.2 bajó de P0 a P3 porque un `check` de columna ya lo frenaba, 9.5
resultó peor de lo descrito, y 9.10 no se podía ver leyendo — apareció recién al
recrear la base desde cero. El análisis estático acierta el *dónde* y falla el
*cuánto*.

Además de validar dentro de las RPC se agregaron `check` de columna en
`operaciones`, replicando lo que `plazos_fijos` ya tenía y que fue justamente lo
que evitó que 9.2 fuera grave. Defensa en profundidad: la validación de
aplicación y la restricción de columna cubren el mismo caso por vías distintas.

**Por qué los P0 importan más de lo que parece.** Las RPC son `security definer`
y están otorgadas a `authenticated`: cualquier usuario logueado podía llamarlas
con `supabase.rpc()` directo, salteándose el formulario y toda su validación. La
validación en el cliente no era una segunda capa, era la única.

## Lint

`npm run lint` corre en el job rápido del CI (entre el typecheck y los tests
unitarios) y termina en cero errores. Dos detalles del setup:

- ESLint ignora `supabase/.temp/**` (`globalIgnores` en `eslint.config.mjs`): es
  un artefacto que deja `supabase start`, código minificado ajeno que sumaba más
  de 150 errores falsos. No se versiona.
- Los fetch-al-montar de los 4 contexts (`Cuentas`, `Trades`, `PlazosFijos`,
  `Portafolios`) llevan un `eslint-disable-next-line
  react-hooks/set-state-in-effect` justificado: son el caso legítimo de
  `useEffect` (sincronizar con Supabase al montar), no un anti-patrón. En cambio
  `AssetAutocomplete` sí tenía uno real —reseteaba estado derivado en un
  effect— y se corrigió moviéndolo a la fase de render.

## Qué NO se prueba automatizado

Decidido de antemano y con su razón escrita. Lo que no está acá tampoco está
cubierto por accidente.

| Qué | Por qué |
|---|---|
| Renderizado de Recharts (SVG) | Se testean los `chartUtils` puros que arman los datos. El SVG es código de terceros y la aserción es frágil. |
| CoinGecko y Yahoo Finance reales | Ningún test toca la red. Se testea `/api/market` con `fetch` mockeado: contrato, símbolo inexistente, timeout, error 5xx. |
| Supabase Auth por dentro | Código de terceros. Se testea que la app reaccione bien a sus resultados, no su implementación. |
| Estilos, tema y regresión visual | P3. Alto costo de mantenimiento y el look cambia seguido. |
| Responsividad y vista móvil | Checklist manual documentado. |
| Crash de React al traducir con el navegador | No se puede automatizar de forma honesta: depende de que Google Translate reescriba el DOM. Queda como caso manual con pasos de reproducción. |
| Cada migración por separado | Se prueba el estado final aplicándolas todas en orden, que es el escenario real de despliegue. |
| Accesibilidad | Fuera de esta suite. Hay hallazgos de Lighthouse pendientes de decisión, que merecen su propio trabajo. |
| Concurrencia real entre dos sesiones sobre la misma cuenta | Las RPC toman bloqueo de fila (`select ... for update`), así que la garantía existe a nivel del motor. Lo que no se automatiza es *demostrar* la carrera: exige orquestar dos sesiones simultáneas, y el escenario que la produciría —la misma persona operando desde dos pestañas— es poco frecuente frente a ese costo. Riesgo aceptado y documentado. |
