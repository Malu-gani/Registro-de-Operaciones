# Diseño de la suite de pruebas automatizada

Fecha: 2026-07-29
Estado: aprobado, pendiente de plan de implementación

## 1. Contexto y objetivo

La app ("Gestor de Portfolio y Operaciones") no tiene hoy ninguna prueba
automatizada: no hay dependencias de testing en `package.json` ni workflows en
`.github/`. Toda la verificación fue manual, por el dueño del repo y por Claude
vía navegador.

El objetivo es una suite que:

1. Proteja lo que tiene consecuencia real — la contabilidad de saldos y el
   aislamiento entre usuarios.
2. Corra en CI en cada push y en cada PR.
3. Sirva como pieza de portfolio de QA: el criterio de priorización y el
   alcance negativo (qué se decide NO probar) son parte del entregable, no
   una nota al pie.

## 2. Criterio de priorización

Las pruebas se ordenan por **consecuencia de la falla**, no por facilidad de
escritura:

| Nivel | Consecuencia | Dónde vive |
|---|---|---|
| **P0** | Se crea, se destruye o se contabiliza mal el dinero. Un usuario ve datos de otro. | Las 6 RPC de `008_funciones_saldos.sql`, políticas RLS |
| **P1** | Un número mal calculado informa una decisión de trading real. | `riskCalculations.ts`, `cuentas.ts`, FIFO del importador |
| **P2** | La UI muestra mal algo correcto, o deja cargar algo inválido. | Validación de formularios, `useListaPaginada`, chips de filtro |
| **P3** | Cosmético: color, espaciado, tema. | Fuera de alcance automatizado |

Regla operativa: ningún test P2 se escribe mientras quede un camino P0 sin
cubrir.

## 3. Decisión: los tests se escriben contra el comportamiento correcto

Durante el diseño se detectaron defectos reales (sección 9). Los tests que los
cubren se escriben contra el comportamiento **documentado y correcto**, no
contra el actual, y por lo tanto **nacen en rojo**.

**Por qué:** una suite que nace verde sobre un bug lo convierte en
especificación. Además, "la suite encontró siete defectos antes de la primera
corrida verde" es el resultado más valioso que puede mostrar.

**Cómo se maneja:** cada test que falla por un defecto conocido se marca con
`test.fail()` (Vitest) y una referencia al ítem de la sección 9. Los arreglos
van en **PRs separados** de la suite, uno por defecto o por familia de
defectos, para que el diff del arreglo sea legible y el test pase de
`test.fail()` a `test()` en el mismo commit que lo corrige.

## 4. Herramientas

| Nivel | Herramienta | Justificación |
|---|---|---|
| Unitario e integración | Vitest | ESM nativo, rápido, un solo runner para todo el proyecto |
| Componentes | Testing Library + jsdom | Prueba comportamiento observable, no implementación |
| SQL / RPC / RLS | Vitest + `supabase-js` contra Supabase local | Ejercita las RPC *como las llama la app*, con el JWT del usuario |
| E2E | Playwright | Traces y video en fallo, corre en CI |
| CI | GitHub Actions | El repo ya está en GitHub |

**pgTAP descartado.** Prueba las funciones desde adentro de Postgres, con
permisos elevados, donde RLS no se ejercita. Como el aislamiento entre usuarios
es P0, testear desde el cliente con sesión real es estrictamente superior.

**Proyecto de Supabase en la nube descartado.** Estado compartido entre
corridas, latencia de red, credenciales reales como secrets en CI, y la suite
no correría en una máquina que solo clonó el repo. Supabase local (`supabase
start`, vía Docker) aplica las 14 migraciones desde cero y trae claves fijas y
públicas.

**Prerrequisito de entorno:** Docker Desktop + WSL2 + Supabase CLI en la
máquina de desarrollo. No bloquea el arranque: los niveles unitario y de
componentes no lo necesitan.

## 5. Alcance por nivel

### 5.1 Unitario (~70% de los tests, P1)

**`riskCalculations.ts`**
- Validación direccional de SL/TP en las 4 combinaciones: Long con SL abajo
  (válido) y arriba (rechaza), Short con SL arriba (válido) y abajo (rechaza);
  idem TP invertido.
- `precioEntrada === precioStopLoss` lanza error controlado, no `Infinity`
  ni `NaN`.
- SL ausente, TP ausente, ambos ausentes: devuelve `tamañoPosicion` y
  `valorPosicion`, y deja `undefined` lo que depende del dato faltante.
- `getRiskLevel` en los límites exactos de las 3 clases, con cortes por defecto
  y personalizados: 3.00 → bajo y 3.01 → medio (acciones); 5.00/5.01 y
  25.00/25.01 (cripto spot); 1.00/1.01 y 10.00/10.01 (futuros); y por encima
  del último corte → crítico.
- `analizarRiesgoApalancado`: el apalancamiento queda embebido en
  `tamañoPosicion`; con apalancamiento 1 (spot) el resultado coincide con
  invertir el monto directo.
- `calcularPnl`: Long ganador y perdedor, Short ganador y perdedor.
- `calcularPlazoFijo`: interés simple y fecha de vencimiento, incluyendo cruce
  de fin de mes y de año.
- `plazoFijoVencido`: vencimiento ayer / hoy / mañana, con la hora local fijada
  para cubrir el desfasaje de huso horario (defecto 9.3).

**`cuentas.ts`**
- `cuentaDeTrade` para las 4 combinaciones de tipo/subtipo.
- `costoOperacion` con apalancamiento ausente, 0 y >1.
- `comprometidoPorCuenta`: ignora operaciones cerradas, suma plazos fijos
  pendientes, no mezcla divisas entre cuentas.

**`tipoMercado.ts`** — matriz completa de 3 tipos de mercado × 3 tipos de
operación en `admiteOperacion`, y las cuentas habilitadas por tipo.

**`passwordPolicy.ts`** — cada requisito faltante por separado y todos juntos;
contraseña válida devuelve `null`.

**Importador (`src/lib/importExport/`)**
- `sanitize.parseNumeroLocale`: `"1.234,56"` (es-AR), `"1,234.56"` (en-US),
  `"1234,56"`, `"1234.56"`, con símbolo de moneda, con signo, vacío → `null`.
  Incluye el caso ambiguo `"1.234"` (defecto 9.6).
- `sanitize.parseFecha`: ISO con y sin hora, `dd/mm/yyyy`, `mm/dd/yyyy` con
  `diaPrimero=false`, año de 2 dígitos, y fecha inexistente como `"31/02/2026"`
  (defecto 9.7).
- `sanitize.simboloBaseCripto`: `"BTC/USDT"`, `"BTC-USDT"`, `"BTCUSDT"`,
  `"BTCUSD"`, `"ETHBTC"`, y un símbolo que ya viene base (`"BTC"`).
- `sanitize.parseLado` con los alias de compra y venta, y valor no reconocido.
- `fifoReconstruction.reconstruirFIFO`: long simple (compra→venta), short
  simple (venta→compra), cierre parcial, cierre que consume dos lotes, vuelta
  de posición (venta mayor al inventario long), sobrante que queda abierto,
  y que operaciones de distinto activo/divisa no se emparejen entre sí.
- `dedup.marcarDuplicados`: duplicado contra existentes, duplicado dentro del
  mismo archivo, y que una abierta no colisione con su versión cerrada.

### 5.2 Integración SQL (~20%, P0)

Contra Supabase local con las 14 migraciones aplicadas en orden desde cero.

**`set_saldo_inicial`** — fija el disponible y deja un movimiento
`ajuste_inicial`; monto negativo rechazado (`MONTO_INVALIDO`); portafolio ajeno
rechazado (`PORTAFOLIO_NO_AUTORIZADO`).

**`registrar_movimiento_cuenta`** — depósito suma; retiro resta; retiro mayor
al disponible falla con `FONDOS_INSUFICIENTES:<cuenta>` y **no deja movimiento
ni cambio de saldo**; tipo y monto inválidos rechazados.

**`abrir_operacion`** — descuenta exactamente `cantidad × precio /
apalancamiento`; ruteo a la cuenta correcta en las 4 combinaciones; fondos
insuficientes deja la base intacta (sin operación, sin movimiento, sin cambio
de saldo — la prueba de atomicidad); fecha futura rechazada (`FECHA_FUTURA`);
**cantidad negativa y precio negativo rechazados** (defecto 9.1).

**`cerrar_operacion`** — cierre total acredita `costo + P&L` y marca la
operación cerrada; cierre parcial reduce la original y crea una fila cerrada
por la porción, acreditando solo esa porción; cantidad 0, negativa o mayor a la
abierta rechazadas (`CANTIDAD_INVALIDA`); cerrar dos veces rechazado
(`OPERACION_YA_CERRADA`); fecha futura rechazada; **fecha de salida anterior a
la de entrada rechazada** (defecto 9.4); **precio de salida negativo
rechazado** (defecto 9.5); cierre de futuros acredita margen + P&L, no el
nocional.

**`abrir_plazo_fijo`** — debita el monto de la cuenta por divisa; fondos
insuficientes deja la base intacta; **monto negativo rechazado** (defecto 9.2).

**`liquidar_plazo_fijo`** — acredita `monto + interés` y marca `liquidado`;
liquidar dos veces rechazado (`PLAZO_YA_LIQUIDADO`).

**RLS y aislamiento** — con dos usuarios A y B creados en el test:
- B no lee portafolios, operaciones, saldos ni movimientos de A.
- B no puede llamar ninguna de las 6 RPC pasando un portafolio de A.
- B no puede insertar una operación en un portafolio de A por `insert` directo.
- `movimientos_cuenta` es append-only: no existen políticas de `update` ni
  `delete`, y los intentos fallan.

**Invariante de contabilidad** — tras una secuencia de operaciones
(saldo inicial → abrir → cerrar parcial → cerrar resto → plazo fijo →
liquidar), la suma con signo de `movimientos_cuenta` de cada cuenta iguala su
`disponible`. Es el test que atrapa cualquier camino que mueva saldo sin
registrar movimiento, o al revés.

### 5.3 Componentes (~5%, P2)

Solo donde hubo un bug real o la lógica es propia:

- **`useListaPaginada`** con `conMinimizar`: arranca colapsado en 5 aunque haya
  40 ítems; maximizar pagina de a 10 y ofrece minimizar; minimizar vuelve a 5 y
  resetea a página 1; con exactamente 5, 6, 10 y 11 ítems (los bordes donde ya
  se rompió dos veces). Sin `conMinimizar`, el modo simple.
- **`RiskPanel`**: oculta R:R y pérdida/ganancia máxima cuando falta SL o TP, y
  muestra el aviso correspondiente.
- **Formulario de nueva operación**: rechaza SL del lado incorrecto según la
  dirección, no ofrece selector Long/Short en acciones ni en cripto spot, y
  bloquea fecha futura.

### 5.4 E2E (~5%, 5 flujos)

Playwright contra la app corriendo sobre Supabase local:

1. Registro → login → la app carga con el portafolio por defecto.
2. Cargar saldo inicial → abrir operación de acciones → el Disponible baja
   exactamente el costo y aparece el movimiento de apertura.
3. Cierre parcial → se acredita costo + P&L de la porción, la posición sigue
   abierta con el resto, y la porción cerrada aparece en Historial.
4. Intento de abrir sin fondos → mensaje contextual con botón de depositar, y
   nada se escribió.
5. Import de un archivo del formato propio → el dedup marca los duplicados
   destildados en el preview.

## 6. Estrategia de datos y aislamiento

Nada de truncar tablas entre tests. Cada test crea **su propio usuario** (email
único, vía la admin API con `service_role`) y opera sobre su propio portafolio:
el aislamiento lo provee RLS, que es justamente lo que se quiere ejercitar.
`supabase db reset` una vez antes de la suite. Los tests pueden correr en
paralelo porque no comparten filas.

La instancia local trae claves fijas y públicas, así que la suite corre en
cualquier máquina que clone el repo, sin `.env.local` real y sin secrets en CI.

## 7. Alcance negativo: qué se decide NO probar

| Qué | Por qué |
|---|---|
| Renderizado de Recharts (SVG) | Se testean los `chartUtils` puros que arman los datos. El SVG es código de terceros y su assertion es frágil. |
| CoinGecko y Yahoo Finance reales | Ningún test toca la red. Se testea `/api/market` con `fetch` mockeado: contrato, símbolo inexistente, timeout, error 5xx. |
| Supabase Auth por dentro | Código de terceros. Se testea que la app reaccione bien a sus resultados, no su implementación. |
| Estilos, tema violeta, regresión visual | P3. Alto costo de mantenimiento y el look cambia seguido. |
| Responsividad y vista móvil | Checklist manual documentado. Hay QA móvil pendiente del PR #23. |
| Crash de React al traducir con el navegador (PR #28) | No se puede automatizar de forma honesta: depende de que Google Translate reescriba el DOM. Queda como caso manual con pasos de reproducción. |
| Cada migración por separado | Se prueba el estado final aplicando las 14 en orden, que es el escenario real de despliegue. |
| Accesibilidad | Fuera de esta suite. Hay hallazgos de Lighthouse pendientes de decisión, que merecen su propio trabajo. |
| Concurrencia real (dos clientes simultáneos sobre la misma cuenta) | Las RPC usan `select ... for update`; probar la carrera de verdad requiere orquestación de sesiones que no justifica el costo para una app de un solo usuario. Se documenta como riesgo aceptado. |

## 8. Integración continua

Un workflow, dos jobs:

- **`rapido`** — en cada push a cualquier rama: `tsc --noEmit`, `eslint`, tests
  unitarios y de componentes. Objetivo: menos de 2 minutos.
- **`completo`** — en cada PR hacia `main`: levanta Supabase local con la CLI,
  aplica migraciones, corre integración SQL y E2E. Sube el reporte de Playwright
  y el de cobertura como artefactos. Objetivo: menos de 8 minutos.

Cobertura: se reporta, no se usa como umbral bloqueante. Un mínimo de cobertura
premia tests de relleno; la priorización de la sección 2 es el criterio real.

## 9. Defectos detectados durante el diseño

Encontrados leyendo el código para armar este documento, antes de escribir un
solo test. Cada uno tiene su test correspondiente en la sección 5.

**9.1 — `abrir_operacion` crea dinero con cantidad o precio negativos (P0).**
`v_costo := (p_cantidad * p_precio_entrada) / greatest(...)`. Con `p_cantidad`
negativa, `v_costo` es negativo; la guarda `if v_disponible < v_costo` pasa
siempre; y `disponible - v_costo` **suma** al saldo. La función es
`security definer` y está otorgada a `authenticated`, así que cualquier usuario
logueado puede llamarla con parámetros arbitrarios desde `supabase.rpc` sin
pasar por el formulario. Falta `if p_cantidad <= 0 or p_precio_entrada <= 0
then raise exception 'MONTO_INVALIDO'`.

**9.2 — `abrir_plazo_fijo` tiene el mismo agujero (P0).** `p_monto` negativo
pasa la validación de fondos y acredita al disponible. `set_saldo_inicial` y
`registrar_movimiento_cuenta` sí validan el signo; estas dos no.

**9.3 — `plazoFijoVencido` mezcla huso horario local con UTC (P1).** Compara
contra `new Date().toISOString().slice(0, 10)`, que es la fecha UTC. En
Argentina (UTC−3), a partir de las 21:00 la fecha UTC ya es la del día
siguiente: un plazo fijo que vence mañana se muestra como vencido tres horas
antes y se muda solo de Posiciones Abiertas a Historial.

**9.4 — `cerrar_operacion` acepta fecha de salida anterior a la de entrada
(P1).** Valida `p_fecha_salida > current_date` pero nunca contra
`op.fecha_entrada`. Permite una operación cerrada antes de abrirse, que ensucia
la curva de equity y los filtros de fecha del historial.

**9.5 — `cerrar_operacion` acepta precio de salida negativo (P0).** Sin guarda
sobre `p_precio_salida`. En un Short, `(precio_entrada - p_precio_salida)` con
salida negativa infla el P&L arbitrariamente y acredita ese monto al
disponible.

*Medido contra la base local el 2026-07-29 (tarea 11), cerrando a −1000 una
posición de 10 unidades abierta a 100 con 4900 de disponible:*

| Dirección | Disponible después | Error devuelto |
|---|---|---|
| Short | **16.000** (+11.100 de la nada) | ninguno |
| Long | **−6.000** | ninguno |

El caso Long agrega un agravante que no estaba previsto: **el disponible queda
negativo**. Toda la lógica de `FONDOS_INSUFICIENTES` existe para que una cuenta
nunca baje de cero, y este camino la esquiva por completo. Sea cual sea la
guarda que se agregue sobre `p_precio_salida`, conviene además **verificar la
invariante `disponible >= 0`** en la tarea 13, porque es la propiedad que el
sistema promete y acá se rompe.

Nota: `cerrar_operacion` **sí** valida `p_cantidad_cerrada` (rechaza 0, negativos
y valores mayores a la posición con `CANTIDAD_INVALIDA`). No es una función sin
guardas: le falta una.

**9.6 — `parseNumeroLocale` interpreta `"1.234"` como 1,234 (P1).** Con un solo
punto y sin coma, asume formato JS.

**Decisión del dueño del repo (2026-07-29): `"1.234"` es mil doscientos treinta
y cuatro.** Regla a implementar y fijar en el test: con un único punto, sin
coma, y exactamente tres dígitos después del punto, el punto es **separador de
miles**. Casos que la regla NO toca: `"1.5"` y `"1.23"` (menos de tres
decimales) siguen siendo decimales; `"1.2345"` (más de tres) también;
`"1.234.567"` (varios puntos) ya se resolvía como miles.

**Efecto colateral a decidir aparte.** La regla es correcta para archivos es-AR
de IOL, pero rompe precios cripto legítimos de exactamente tres decimales: un
Bitget que exporta `"1.234"` como precio de un token barato pasaría a leerse
como 1234, un error de factor 1000 en el precio de entrada. Mitigación
propuesta: **aplicar la regla por parser**, no globalmente — es-AR (IOL) usa la
regla de miles, en-US (Bitget, formato propio) mantiene la interpretación JS.
`parseNumeroLocale` recibe entonces un parámetro de locale, igual que
`parseFecha` ya recibe `diaPrimero`. Los tests cubren las dos ramas. Si el
dueño prefiere la regla global, se cambia el default y se ajusta el test de
Bitget.

**9.7 — `parseFecha` acepta fechas inexistentes (P2).** `armarFecha` valida
rangos (`mes 1-12`, `día 1-31`) pero no el calendario: `"31/02/2026"` devuelve
`"2026-02-31"`, que Postgres después rechaza con un error crudo en vez de un
mensaje de fila inválida en el preview del importador.

**9.8 — `calcularRatioRiesgoBeneficio` contradice al núcleo de cálculo (P2).**
La función exportada usa `Math.abs` (ignora la validación direccional) y
devuelve `0` cuando el riesgo por unidad es cero, mientras
`analizarConTamañoPosicion` lanza un error para el mismo caso. Dos respuestas
distintas para la misma pregunta; `docs/financial-logic.md` documenta la
segunda.

**9.9 — `if (precioStopLoss)` trata el 0 como "sin stop loss" (P2).** Un stop
loss de 0 se ignora en silencio en vez de validarse. Poco probable en acciones,
posible en cripto de precio muy bajo. Corresponde `!== undefined`.

**9.10 — El esquema no otorga permisos de tabla explícitos (P1, latente).**
Detectado el 2026-07-29 al levantar el harness (tarea 8). Ni `schema.sql` ni
ninguna migración hace `grant select, insert, update, delete ... to
authenticated`: el proyecto **hereda los permisos por defecto del entorno**.

En el proyecto de Supabase en la nube eso funciona hoy, por eso nunca se notó.
Pero es una dependencia implícita de una configuración que el repo no controla:
en una base local recién creada, las tablas creadas por el rol `postgres`
quedan con `Dxtm` para `authenticated` —sin `SELECT`/`INSERT`/`UPDATE`/
`DELETE`— y **toda la app es invisible para sus propios usuarios**. El error
que aparece es `permission denied for table portafolios`, que se confunde
fácil con un problema de RLS siendo otra capa: RLS filtra filas y devuelve un
resultado vacío; un `GRANT` faltante corta antes y tira error.

Consecuencia real: el repo **no es autosuficiente para recrear la base**. Una
migración a otro proyecto de Supabase, un cambio en los valores por defecto de
la plataforma, o un restore desde cero pueden dejar la app rota con un error
que no señala la causa.

Mitigado en el harness (`scripts/aplicar-migraciones.mjs` aplica como
`supabase_admin`, que sí hereda el juego completo), **no en el producto**. El
arreglo de producto son `grant` explícitos por tabla, y va en **PR aparte,
después de terminar la suite** — ver la nota de numeración en el orden de PRs.

Los defectos 9.1, 9.2 y 9.5 son de la misma familia: **las RPC confían en que
el cliente manda parámetros sensatos**. La app real siempre los manda bien,
pero la superficie de ataque es la RPC, no el formulario. El arreglo natural es
un bloque de validación de parámetros al inicio de cada función.

## 10. Criterios de éxito

- Los caminos P0 de la sección 5.2 tienen test, incluidos los negativos.
- La suite corre entera con `npm test` en una máquina recién clonada, sin
  credenciales propias.
- CI verde en `main`, con los defectos de la sección 9 arreglados o
  explícitamente marcados como `test.fail()` con su referencia.
- El alcance negativo de la sección 7 está en el repo y se mantiene al día.

## 11. Riesgos

- **Docker en Windows.** Es el único prerrequisito pesado. Si Docker Desktop no
  arranca en la máquina, el plan B es Rancher Desktop o Podman con la misma
  Supabase CLI encima. Los niveles unitario y de componentes no dependen de él.
- **Flakiness de E2E.** Se acota manteniendo el nivel en 5 flujos y usando
  esperas por estado (`expect(...).toHaveText`), nunca por tiempo.
- **Las migraciones se corren hoy a mano en el SQL Editor.** La suite las
  aplica desde archivos; si alguna migración fue editada en Supabase sin
  reflejarse en el repo, los tests van a divergir del proyecto real. El primer
  `supabase db reset` verde es también la verificación de que el repo y la base
  están sincronizados.
