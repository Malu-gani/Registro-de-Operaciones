# Arquitectura del Sistema

## 1. Stack Tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| Web | Next.js (App Router) + TypeScript | Estándar de la industria, gran comunidad, despliegue simple en Vercel |
| Móvil | React Native (Expo) | Reutiliza lógica y componentes con la web |
| Estilos | Tailwind CSS | Desarrollo rápido de UI sin CSS manual |
| Backend / DB / Auth | Supabase (PostgreSQL) | Base relacional (encaja con las relaciones usuario→portafolio→operación), auth y storage incluidos, plan gratuito generoso |
| Datos de mercado (cripto) | CoinGecko API | Plan gratuito robusto, sin tarjeta de crédito |
| Datos de mercado (acciones) | Yahoo Finance / Alpha Vantage | Gratuitos con límites, suficientes para el MVP |
| Hosting | Vercel | Integración nativa con Next.js, despliegue automático |

## 2. Modelo de Datos Relacional

### Usuarios

No hay tabla `usuarios` propia: la autenticación es 100% Supabase Auth
(tabla interna `auth.users`, no se toca directamente). Login solo con
email + contraseña (sin OAuth, decisión explícita del MVP). Un trigger de
Postgres (`handle_new_user`, ver `supabase/002_auth_and_rls.sql`) crea
automáticamente un portafolio por defecto ("Mi Cuenta Principal") apenas
se registra un usuario nuevo — ese portafolio pasa a ser simplemente el
primero de varios posibles.

**Multi-portafolio implementado (2026-07-11).** El usuario puede crear,
renombrar y borrar portafolios; un selector en el Navbar
(`src/components/Navbar.tsx`) filtra toda la app por el portafolio activo
(`PortafoliosContext` en `src/context/PortafoliosContext.tsx`, con
`portafolioActivoId: string | "todos"` persistido en `localStorage`).
Con "Todos los portafolios" activo, Dashboard/Historial muestran datos
combinados de todos los portafolios del usuario, y `/portafolio` muestra
una sección completa (tortas + Cuenta de Futuros) por cada portafolio,
sin mezclar ni sumar entre sí (tampoco se convierten monedas — ARS, USD y
USDT siempre se muestran desglosados, nunca sumados). Ver detalle de la
implementación en la sección "Multi-portafolio" del historial de
sesiones (`CLAUDE.md`).

### Tabla: `portafolios`
- `id`
- `user_id` → FK a `auth.users` (dueño del portafolio)
- `nombre`
- `tipo_mercado` (cripto / acciones / mixto)
- `capital_inicial`
- `capital_actual`
- `created_at`

### Tabla: `operaciones`
- `id`
- `portafolio_id` → FK a `portafolios`
- `activo`
- `tipo_activo` (acciones / crypto)
- `sub_tipo_activo` (acciones: cedear / usd — crypto: spot / futuros)
- `divisa` (USD / ARS / USDT)
- `apalancamiento` (solo crypto futuros)
- `tipo_operacion` (long / short)
- `fecha_entrada`
- `precio_entrada` (obligatorio)
- `precio_stop_loss` (opcional — `nullable`, ver
  `supabase/006_stop_loss_take_profit_opcionales.sql`)
- `precio_take_profit` (opcional — `nullable`, misma migración)
- `cantidad`
- `fecha_salida`
- `precio_salida`
- `estado` (abierta / cerrada)
- `resultado_pnl`
- `ratio_riesgo_beneficio` (opcional — `nullable`; solo se puede calcular
  si la operación tiene Stop Loss Y Take Profit cargados)
- `porcentaje_riesgo_cuenta` (opcional — `nullable`; solo se puede
  calcular si hay Stop Loss cargado). Pese al nombre de columna
  (histórico), hoy representa el % de riesgo respecto al capital
  invertido en la propia operación, no respecto al balance de la cuenta.
  En el código TypeScript este campo se llama `porcentajeRiesgoOperacion`
  (`src/types/trading.ts`).
- `notas`

### Tabla: `plazos_fijos`
- `id`
- `portafolio_id` → FK a `portafolios`
- `monto`
- `divisa` (USD / ARS)
- `tasa_tna`
- `plazo_dias`
- `fecha_inicio`
- `fecha_vencimiento`
- `interes_estimado`
- `notas`

Registro separado de `operaciones`: no tiene stop loss/take profit ni
entra en el cálculo de win rate/R:R del dashboard (ver
`src/utils/riskCalculations.ts#calcularPlazoFijo`).

**Ciclo de vida (2026-07-12):** no hay columna `estado` — se deriva en el
cliente comparando `fecha_vencimiento` contra la fecha de hoy
(`plazoFijoVencido()` en `riskCalculations.ts`). Mientras
`fecha_vencimiento` sea futura, el plazo fijo aparece en **Posiciones
Abiertas** (pestaña "Plazos Fijos", con días restantes); apenas se
alcanza esa fecha, deja de aparecer ahí y pasa a **Historial** (pestaña
"Plazos Fijos") con sus datos ya fijos (monto, TNA, interés). No requiere
ningún job de servidor ni acción manual del usuario.

### Tabla: `movimientos_futuros` (en desuso, ver 2.2)
- `id`
- `portafolio_id` → FK a `portafolios`
- `monto` (positivo = depósito, negativo = retiro)
- `fecha`
- `notas`

Ledger legado de movimientos manuales de la cuenta de Futuros, previo al
sistema de saldos por cuenta (2.1). Sus filas fueron migradas una sola vez
a `movimientos_cuenta` (cuenta `usdt_futuros`) en
`supabase/007_cuentas_y_movimientos.sql`; la tabla vieja no se borró por
seguridad pero ya no se lee ni se escribe desde la app (2026-07-14: se
sacó la caja de depósitos de Futuros de `/portafolio`, que era la última
lectora). `/portafolio` ahora solo muestra un resumen de Disponible +
Comprometido de la cuenta de Futuros con un link a `/cuenta` para operarla.

### Tabla: `alertas` (no implementada todavía)
- `id`
- `operacion_id` → FK a `operaciones`
- `tipo_alerta` (stop loss / take profit)
- `precio_objetivo`
- `estado` (pendiente / disparada)
- `fecha_disparo`

## 2.1 Sistema de saldos por cuenta (2026-07-14)

Cada portafolio tiene 4 "cuentas" (bolsillos), una por divisa/mercado —
`CuentaId` en `src/types/trading.ts`:

| Cuenta | Divisa | Cubre |
|---|---|---|
| `ars` | ARS | CEDEARs + plazo fijo ARS |
| `usd` | USD | Acciones USD + plazo fijo USD |
| `usdt_spot` | USDT | Cripto Spot |
| `usdt_futuros` | USDT | Cripto Futuros (margen) — billetera separada de `usdt_spot` |

No se convierten divisas entre cuentas (mismo criterio que Multi-portafolio).

### Tabla: `cuentas_saldos`
- `id`
- `portafolio_id` → FK a `portafolios`
- `cuenta` (`ars` / `usd` / `usdt_spot` / `usdt_futuros`)
- `disponible` — el **Capital No Comprometido** de esa cuenta
- `updated_at`
- único por `(portafolio_id, cuenta)`

Solo se persiste el **Disponible**. El **Comprometido** no se guarda: se
deriva en el cliente sumando el costo de las posiciones abiertas y los
plazos fijos pendientes de esa cuenta (`comprometidoPorCuenta()` en
`src/utils/cuentas.ts`) — mismo criterio que ya se usaba para el balance
de Futuros antes de este sistema.

### Tabla: `movimientos_cuenta`
Ledger unificado (append-only, no se edita) de todo lo que mueve el
Disponible de una cuenta:
- `id`, `portafolio_id`, `cuenta`
- `tipo`: `deposito` / `retiro` / `ajuste_inicial` (carga de saldo inicial)
  / `apertura` / `cierre` (de operaciones) / `plazo_apertura` /
  `plazo_liquidacion` (de plazos fijos)
- `monto` — con signo: positivo suma al Disponible, negativo resta
- `fecha`, `notas`, `ref_operacion_id` (id de la operación o plazo fijo
  que originó el movimiento, si aplica)

Reemplaza a `movimientos_futuros` (ver 2. Tabla `movimientos_futuros`,
ahora en desuso).

### Mutaciones vía funciones RPC (`supabase/008_funciones_saldos.sql`)

Todas las escrituras al Disponible pasan por funciones de Postgres
(`security definer`, llamadas con `supabase.rpc(...)` desde
`src/lib/cuentasApi.ts` / `tradesApi.ts` / `plazosFijosApi.ts`), no por
`insert`/`update` directos del cliente. Cada función corre en una sola
transacción: valida fondos del lado del servidor y, si algo falla, no
queda nada a medias (reemplaza el doble-write no atómico que existía
antes para cerrar operaciones).

| Función | Qué hace |
|---|---|
| `set_saldo_inicial` | Fija el Disponible de una cuenta ("cargá tus saldos de hoy"). |
| `registrar_movimiento_cuenta` | Depósito o retiro manual; valida que el retiro no deje el Disponible negativo. |
| `abrir_operacion` | Calcula el costo (`cantidad × precioEntrada / apalancamiento`), valida fondos, inserta la operación y debita el Disponible de la cuenta correspondiente. |
| `cerrar_operacion` | Soporta cierre total o parcial; acredita `costo de la porción cerrada + P&L` al Disponible. |
| `abrir_plazo_fijo` | Valida fondos y debita el monto del plazo fijo. |
| `liquidar_plazo_fijo` | Marca el plazo como `liquidado` (columna nueva en `plazos_fijos`, evita acreditar dos veces) y acredita `monto + interés`. |

Si una función detecta fondos insuficientes, levanta la excepción
`FONDOS_INSUFICIENTES:<cuenta>`; la app la captura y muestra el mensaje
contextual con botón de depositar (`MensajeFondosInsuficientes.tsx`).

### Pantalla `/cuenta`

Nueva pantalla (`src/app/(app)/cuenta/page.tsx`) que muestra, por cuenta,
Disponible + Comprometido + historial de `movimientos_cuenta`, y permite
cargar saldo inicial y depositar/retirar. Estado global en
`CuentasContext` (`src/context/CuentasContext.tsx`). Cada tarjeta de cuenta
incluye una barra "Comprometido vs No Comprometido" (`BarraComprometido`,
2026-07-14) que se oculta si la cuenta no tiene capital cargado.

### Paginación de listas (2026-07-14)

Hook + componente compartidos en `src/components/ListaPaginada.tsx`
(`useListaPaginada`, `ControlesListaPaginada`), aplicados sobre listas ya
cargadas completas en memoria (no hay paginación del lado del servidor):
Posiciones Abiertas (las 5 pestañas), Historial (operaciones cerradas y
plazos fijos vencidos) y el historial de movimientos de `/cuenta`. Regla:
≤5 registros sin controles, 6-10 con botón "Ver todos", &gt;10 pasa a
paginación real de a 10. Los componentes de tabla reusados entre pestañas
(`TablaOperacionesAbiertas` en Posiciones Abiertas) llevan `key` explícita
por pestaña para resetear la paginación al cambiar de tab.

## 2.2 Seguridad de acceso (RLS)

Cada tabla tiene Row Level Security activada. Las políticas (ver
`supabase/002_auth_and_rls.sql`) restringen todo acceso a filas cuyo
portafolio pertenece al usuario autenticado (`auth.uid()`) — un usuario
nunca puede leer ni escribir datos de otro. La clave `anon`/`publishable`
usada en el cliente no tiene acceso amplio por sí sola; depende de la
sesión (cookie) del usuario autenticado.

## 3. Reglas de Negocio: Semáforo de Riesgo

Aplicadas sobre el % de riesgo de la operación (qué tan lejos está el stop
loss del precio de entrada). El % de riesgo del Stop Loss respecto al
precio de entrada solo se calcula si el Stop Loss ya pasó la validación
direccional (ver [`docs/financial-logic.md`](financial-logic.md)): para
Long debe estar por debajo de la entrada, para Short por arriba — si no,
se rechaza la carga antes de llegar al semáforo.

Los umbrales difieren según la **clase de activo** (`ClaseActivo` en
`src/utils/riskCalculations.ts`: `"acciones" | "cripto_spot" | "futuros"`),
tanto en los % de corte como en la base del % de riesgo. Cada nivel es
inclusive en su límite superior (`<=`), de forma continua — un 3.00% en
Acciones cae en "Bajo" y un 3.01% ya cae en "Medio", sin puntos ciegos:

**Acciones y CEDEARs** — % sobre el capital invertido en la operación
(`ValorPosicion`), **no** el balance total de la cuenta:

| Condición | Nivel | Color | Comportamiento en UI |
|---|---|---|---|
| Riesgo ≤ 3% | Bajo | 🩵 Celeste | Estado normal, sin advertencia |
| Riesgo > 3% y ≤ 8% | Medio | 🟢 Verde | Aviso leve |
| Riesgo > 8% y ≤ 15% | Alto | 🟠 Naranja | Aviso |
| Riesgo > 15% | Crítico | 🔴 Rojo | Banner de advertencia |

**Cripto Spot** — % sobre el capital invertido en la operación:

| Condición | Nivel | Color | Comportamiento en UI |
|---|---|---|---|
| Riesgo ≤ 5% | Bajo | 🩵 Celeste | Estado normal, sin advertencia |
| Riesgo > 5% y ≤ 15% | Medio | 🟢 Verde | Aviso leve |
| Riesgo > 15% y ≤ 25% | Alto | 🟠 Naranja | Aviso |
| Riesgo > 25% | Crítico | 🔴 Rojo | Banner de advertencia |

**Cripto Futuros** — % sobre el valor nocional de la posición (`Monto ×
Apalancamiento`, que en el código ya es `ValorPosicion`):

| Condición | Nivel | Color | Comportamiento en UI |
|---|---|---|---|
| Riesgo ≤ 1% | Bajo | 🩵 Celeste | Estado normal, sin advertencia |
| Riesgo > 1% y ≤ 3% | Medio | 🟢 Verde | Aviso leve |
| Riesgo > 3% y ≤ 10% | Alto | 🟠 Naranja | Aviso |
| Riesgo > 10% | Crítico | 🔴 Rojo | Banner de advertencia |

La matriz completa vive centralizada en `MATRIZ_RIESGO` (constante privada
de `riskCalculations.ts`), consumida a través de la función exportada
`getRiskLevel(porcentaje, claseActivo)` — para cambiar algún corte en el
futuro alcanza con editar esa tabla en un solo lugar.

Aplicadas sobre el Ratio Riesgo/Beneficio (R:R):

| Condición | Color | Comportamiento en UI |
|---|---|---|
| R:R < 1 | 🔴 Rojo | Advertencia: "Estás arriesgando más de lo que puedes ganar" |
| 1 ≤ R:R < 2 | 🟡 Amarillo | Neutral |
| R:R ≥ 2 | 🟢 Verde | Indicador positivo ("Buena relación riesgo/beneficio") |

Estos umbrales de R:R deben ser configurables por usuario a futuro, pero
se usan como constantes por defecto en el MVP (función `rrNivel()` en
`src/components/RiskPanel.tsx`).

## 3.1 Direccionalidad Long/Short y restricción de mercados

- Acciones y CEDEARs solo operan Long (no hay CFDs) — no tienen selector
  de dirección en el formulario.
- Cripto Spot solo opera Long (comprar barato para vender caro) — el
  selector Long/Short no se muestra cuando el mercado elegido es Spot.
- Cripto Futuros sí permite Long y Short.
