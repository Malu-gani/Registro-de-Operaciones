# Suite de pruebas

Al 2026-11-28 son **433 pruebas**.

| Tipo | Archivos | Pruebas al 2026-11-28 | Cierre de julio de 2026 |
|---|---|---|---|
| Unitarias | 17 | 236 | 186 |
| Componentes | 3 | 22 | 18 |
| Integración contra Postgres | 9 | 166 | 66 |
| End-to-end | 2 | 9 | 5 |
| **Total** | **31** | **433** | **275** |

- **Fuente de las cifras actuales:** unitarias, componentes e integración,
  corridas locales del 2026-11-28 sobre el cambio del pull request #64.
  End-to-end, la
  [corrida de CI 45674446992](https://github.com/Malu-gani/Registro-de-Operaciones/actions/runs/45674446992)
  (pull request #62, 2026-11-25); el #64 no toca esos tests.
- **Qué se cuenta:** casos ejecutados; cada caso de una tabla (`test.each` o un
  bucle) suma uno. De las 166 de integración, 91 son de
  `permisosTablas.test.ts`, casi todas combinaciones de rol, tabla y
  privilegio.
- **La columna de julio es histórica:** son las 275 con las que se terminó de
  construir la suite. Los E2E pasaron de 5 a 9 poco después, con la verificación
  por email.

## Criterio de priorización

Las pruebas se ordenan por **consecuencia de la falla**, no por facilidad de
escritura. En una app que calcula riesgo, el peor escenario no es que algo se
rompa: es que devuelva un número plausible y equivocado.

| Nivel | Consecuencia | Dónde vive |
|---|---|---|
| **P0** | Se crea, se destruye o se contabiliza mal el dinero. Un usuario ve datos de otro. | Las 6 RPC de saldos (creadas en `008_funciones_saldos.sql`, varias redefinidas en migraciones posteriores), políticas RLS, permisos de tabla |
| **P1** | Un número mal calculado informa una decisión de trading real. | `riskCalculations.ts`, `cuentas.ts`, FIFO del importador |
| **P2** | La UI muestra mal algo correcto, o deja cargar algo inválido. | Validación de formularios, `useListaPaginada`, chips de filtro |
| **P3** | Cosmético: color, espaciado, tema. | Fuera de alcance automatizado |

Regla operativa: ningún test P2 se escribe mientras quede un camino P0 sin
cubrir. Eso explica la forma de la pirámide — base ancha en unitario y SQL,
E2E deliberadamente chico. Hoy quedan caminos P0 sin cubrir: ver
[Huecos conocidos](#huecos-conocidos).

**No se mide cobertura**: no hay herramienta configurada ni umbral. Un mínimo de
cobertura premia tests de relleno, y el criterio real es esta tabla.

## Cómo correrla

| Comando | Qué corre | Necesita Docker |
|---|---|---|
| `npm test` | Unitarios y componentes | No |
| `npm run test:componentes` | Solo componentes | No |
| `npm run test:watch` | Unitarios y componentes, en modo watch | No |
| `npm run typecheck` | Chequeo de tipos (`tsc --noEmit`) | No |
| `npm run lint` | ESLint | No |
| `npm run test:sql` | Integración contra las RPC, RLS y permisos de tabla | Sí |
| `npm run test:e2e` | Los 9 tests de Playwright | Sí |
| `npm run db:reset` | Recrea la base local desde las migraciones (borra sus datos) | Sí |

Los tres que dicen "Sí" necesitan Supabase local levantado:

```
npm run db:start
```

Hay que correrlo cada vez que se reinicia Docker Desktop. En una base nueva, o
cuando se agrega una migración, hace falta además `npm run db:reset`:
`db:start` no aplica estos `.sql` porque no están en `supabase/migrations/`.

La primera corrida de E2E también necesita el navegador:

```
npx playwright install chromium
```

Los E2E compilan la app y la levantan en el puerto **3100**, no en el 3000, así
que se pueden correr con un `npm run dev` propio abierto al lado. Fuera de CI, si
ya hay algo respondiendo en el 3100, Playwright lo reutiliza.

## Cómo está organizada

- `tests/unit/` — sobre todo lógica pura (fórmulas de riesgo, cuentas,
  importador, datos de mercado, contraseñas, rutas seguras), más las rutas
  `/api/market`, la acción de registro y las clases de layout de los
  formularios.
- `tests/componentes/` — `useListaPaginada`, `RiskPanel` y `PasswordInput`.
- `tests/sql/` — las 6 RPC de saldos, RLS, el invariante contable, los permisos
  de tabla (migración 022) y las llamadas superpuestas sobre una misma operación
  o plazo fijo (`concurrencia.test.ts`, migración 023).
- `tests/e2e/` — en navegador: `flujos.spec.ts` (5 flujos de negocio) y
  `verificacion-email.spec.ts` (4: confirmación del registro, reenvío,
  recuperación de contraseña y respuesta neutra ante un email inexistente). Los
  mails se leen del atrapa-mails local, en el puerto 54324.
- `tests/setup/` — preparación compartida: conexión con Supabase local, usuarios
  de prueba, jsdom y `filaRetenida.ts`, que superpone llamadas de forma
  determinista: retiene una fila desde una sesión de `psql`, lanza las llamadas
  y la libera cuando están todas en espera.

Los tests que escriben datos usan usuarios propios: el aislamiento lo da RLS, no
un truncate entre tests, así que pueden correr en paralelo. La matriz de
`permisosTablas.test.ts` no necesita usuarios: lee los privilegios con `psql`
dentro del contenedor de la base.

Vitest consulta la configuración de Supabase local **una sola vez** por corrida
(`tests/setup/globalSetup.ts`); Playwright la consulta aparte, en
`playwright.config.ts`. No invocar la CLI desde un archivo de test: con varios
workers en paralelo compiten por su archivo de telemetría y en Windows uno falla
con `FileSystem.rename`, tumbando un test al azar.

## Qué corre en CI

- Job **rápido** (en cada push y en cada pull request a `main`): typecheck, lint
  y `npm test`.
- Job **completo** (solo en pull requests a `main`): Supabase en Docker,
  migraciones, `test:sql`, `test:e2e` (con un reintento por test) y el reporte de
  Playwright como artefacto.

## Defectos conocidos

Los defectos detectados al diseñar la suite se cubrieron con tests escritos
contra el comportamiento **correcto**, no contra el que tenía la app. Nacen en
rojo a propósito, marcados con `test.fails(...)`: una suite que nace verde sobre
un bug lo convierte en especificación. El arreglo va en un PR aparte del de la
suite, y ahí el test pasa de `test.fails` a `test` en el mismo commit.

Hoy la suite no tiene ningún `test.fails`: los 10 defectos que encontró están
arreglados. Si la suite cubre uno nuevo, se documenta con esta misma técnica.

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
- Los contexts `Cuentas`, `Trades`, `PlazosFijos` y `Portafolios` llevan un
  `eslint-disable-next-line react-hooks/set-state-in-effect` justificado. En los
  tres primeros cubre el fetch al montar, el caso legítimo de `useEffect`
  (sincronizar con Supabase); en `Portafolios`, el aviso de "Supabase no está
  configurado". `AssetAutocomplete` sí tenía un anti-patrón real —reseteaba
  estado derivado en un effect— y se corrigió moviéndolo a la fase de render;
  conserva un disable puntual para limpiar las sugerencias cuando el texto es
  muy corto. Aparte, `SeccionBorrarCuenta` desactiva una regla de Next en una
  línea.

## Qué NO se prueba automatizado

Alcance excluido a propósito, cada punto con su razón. Lo que falta cubrir sin
haberlo decidido va aparte, en [Huecos conocidos](#huecos-conocidos).

| Qué | Por qué |
|---|---|
| Renderizado de Recharts (SVG) | El SVG es código de terceros y la aserción es frágil. |
| CoinGecko y Yahoo Finance reales | Los tests unitarios no salen a la red: `marketData.test.ts` mockea `fetch` (símbolo inexistente, respuestas 429 y 503, error de red, precio inválido) y `apiMarket.test.ts` mockea la sesión y `marketData` para fijar los 401, 200 y 400 de `/api/market`. En E2E, `flujos.spec.ts` intercepta esas rutas en el navegador. |
| Supabase Auth por dentro | Código de terceros. Se testea que la app reaccione bien a sus resultados, no su implementación. |
| Estilos, tema y regresión visual | P3. Alto costo de mantenimiento y el look cambia seguido. La excepción son `formStyles.test.ts` y `formColSpan.test.ts`, que fijan las clases de layout de los formularios a raíz de un bug en Android. |
| Responsividad y vista móvil | Se valida a mano; no hay checklist escrito en el repo. |
| Crash de React al traducir con el navegador | No se puede automatizar de forma honesta: depende de que Google Translate reescriba el DOM. Es un caso manual, sin pasos de reproducción escritos en el repo. La regla para evitarlo (cambiar clases, no insertar ni quitar nodos) está comentada en `globals.css`. |
| Cada migración por separado | Se prueba el estado final aplicándolas todas en orden, que es el escenario real de despliegue. |
| Accesibilidad | Fuera de esta suite. Hay hallazgos de Lighthouse pendientes de decisión, que merecen su propio trabajo. |

## Huecos conocidos

Revisados contra los tests el 2026-11-28. No son decisiones de alcance: falta
cubrirlos.

- La concurrencia se prueba solo en `cerrar_operacion` y `liquidar_plazo_fijo`
  (migración 023). `registrar_movimiento_cuenta`, `abrir_operacion` y
  `abrir_plazo_fijo` bloquean la fila del saldo con `select ... for update`,
  pero ningún test lo ejercita.
- `delete_own_account` (migración 013) no tiene test.
- `liquidar_plazo_fijo` se prueba sin el interés real que agregó la migración
  018.
- `rls.test.ts` no prueba que un usuario no pueda leer los `plazos_fijos` ni las
  `preferencias_usuario` de otro.
- Los gráficos no tienen tests, tampoco las funciones puras de `chartUtils.ts`.
