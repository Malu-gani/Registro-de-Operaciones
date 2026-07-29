# Suite de pruebas automatizada — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir desde cero la suite de pruebas automatizada de la app —
unitaria, integración SQL contra Supabase local, componentes y E2E — priorizada
por consecuencia de la falla y corriendo en GitHub Actions.

**Architecture:** Un solo runner (Vitest) para unitario, integración y
componentes; Playwright para E2E. La capa SQL se prueba llamando las RPC con
`supabase-js` autenticado como un usuario real, contra una instancia de Supabase
local levantada con la CLI — así se ejercita RLS de verdad. Cada test crea su
propio usuario, así que no comparten filas y pueden correr en paralelo.

**Tech Stack:** Vitest 3, @testing-library/react, jsdom, Playwright, Supabase
CLI (Docker), GitHub Actions, Node 22.

**Spec:** [`docs/superpowers/specs/2026-07-29-suite-de-pruebas-design.md`](../specs/2026-07-29-suite-de-pruebas-design.md)

## Global Constraints

- **Node 22** en CI y en desarrollo. Next.js 16 no soporta Node < 20.
- **Ningún test toca la red.** CoinGecko y Yahoo Finance se mockean siempre.
- **Ningún test usa `.env.local` ni credenciales del proyecto real de Supabase.**
  Las claves de la instancia local se leen en runtime con `supabase status -o json`.
- **Los tests de defectos conocidos se escriben contra el comportamiento
  correcto** y se marcan con `test.fails(...)` más un comentario `// Defecto 9.N
  del spec`. Cuando el defecto se arregle (PR aparte), `test.fails` pasa a `test`
  en el mismo commit.
- **El servidor de E2E corre en el puerto 3100**, no el 3000. El 3000 lo usa el
  dueño del repo para su `npm run dev` y Next bloquea una segunda instancia por
  el lock de `.next/`.
- **Copy de la app en registro formal (usted).** Aplica a cualquier texto nuevo
  que un test tenga que aseverar.
- **Nunca commitear a `main` directo.** Todo el trabajo va en la rama
  `feat/suite-de-pruebas` y se integra por PR.

## Estructura de archivos

```
vitest.config.ts                       Config de Vitest: alias @, dos proyectos (node y jsdom)
playwright.config.ts                   Config de Playwright: webServer en :3100
scripts/aplicar-migraciones.mjs        Aplica schema.sql + 002..014 en orden contra la base local
tests/
  setup/
    entornoSupabase.ts                 Lee `supabase status`, expone URLs y claves
    usuarios.ts                        crearUsuarioDePrueba() -> cliente autenticado + portafolio
    jsdom.setup.ts                     Matchers de @testing-library/jest-dom
  unit/
    riskCalculations.semaforo.test.ts
    riskCalculations.analisis.test.ts
    cuentas.test.ts
    tipoMercado.test.ts
    passwordPolicy.test.ts
    importExport.sanitize.test.ts
    importExport.fifo.test.ts
    importExport.dedup.test.ts
  sql/
    saldos.test.ts                     set_saldo_inicial + registrar_movimiento_cuenta
    abrirOperacion.test.ts
    cerrarOperacion.test.ts
    plazosFijos.test.ts
    rls.test.ts                        Aislamiento entre usuarios + append-only
    invarianteContable.test.ts
  componentes/
    useListaPaginada.test.tsx
    RiskPanel.test.tsx
  e2e/
    flujos.spec.ts
.github/workflows/ci.yml               Jobs `rapido` y `completo`
supabase/config.toml                   Generado por `supabase init`
```

**Por qué así:** los tests viven fuera de `src/` para que el build de Next no los
toque y para que la separación por nivel sea visible de un vistazo — es parte del
entregable de portfolio. `tests/setup/` concentra todo lo que habla con Supabase
local, así que si cambia la CLI se toca un solo lugar.

---

### Task 1: Instalar Vitest y probar el semáforo de riesgo

Primera prueba del proyecto. Se elige el semáforo porque es lógica pura, no
necesita Docker, y sus bordes son los que más fácil se rompen al editar umbrales.

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/unit/riskCalculations.semaforo.test.ts`
- Modify: `package.json` (dependencias + scripts)

**Interfaces:**
- Consumes: `getRiskLevel(porcentaje, claseActivo, umbrales?)` y
  `UMBRALES_RIESGO_DEFAULT` de `src/utils/riskCalculations.ts`.
- Produces: el comando `npm test`, y `vitest.config.ts` con el alias `@` → `src/`
  del que dependen todas las tareas siguientes.

- [ ] **Step 1: Crear la rama de trabajo**

```bash
git checkout -b feat/suite-de-pruebas
```

- [ ] **Step 2: Instalar Vitest**

```bash
npm install -D vitest@^3 vite-tsconfig-paths@^5
```

- [ ] **Step 3: Crear `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Los tests de SQL y E2E tienen su propio comando: `npm test` no los corre.
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Agregar los scripts a `package.json`**

En el bloque `"scripts"`, junto a los existentes:

```json
"test": "vitest run",
"test:watch": "vitest",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 5: Escribir el test que falla**

Crear `tests/unit/riskCalculations.semaforo.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import {
  getRiskLevel,
  UMBRALES_RIESGO_DEFAULT,
  type ClaseActivo,
  type NivelRiesgo,
} from "@/utils/riskCalculations";

/**
 * Cada nivel es inclusive en su límite superior: 3.00 todavía es "bajo" y 3.01
 * ya es "medio". Son los bordes donde un `<` en vez de un `<=` pasa inadvertido.
 */
const CASOS_DEFAULT: Array<[ClaseActivo, number, NivelRiesgo]> = [
  ["acciones", 0, "bajo"],
  ["acciones", 3, "bajo"],
  ["acciones", 3.01, "medio"],
  ["acciones", 8, "medio"],
  ["acciones", 8.01, "alto"],
  ["acciones", 15, "alto"],
  ["acciones", 15.01, "critico"],
  ["cripto_spot", 5, "bajo"],
  ["cripto_spot", 5.01, "medio"],
  ["cripto_spot", 15, "medio"],
  ["cripto_spot", 15.01, "alto"],
  ["cripto_spot", 25, "alto"],
  ["cripto_spot", 25.01, "critico"],
  ["futuros", 1, "bajo"],
  ["futuros", 1.01, "medio"],
  ["futuros", 3, "medio"],
  ["futuros", 3.01, "alto"],
  ["futuros", 10, "alto"],
  ["futuros", 10.01, "critico"],
];

describe("getRiskLevel con umbrales por defecto", () => {
  test.each(CASOS_DEFAULT)("%s al %f%% es %s", (clase, porcentaje, esperado) => {
    expect(getRiskLevel(porcentaje, clase)).toBe(esperado);
  });

  test("un riesgo mayor al 100% sigue siendo crítico", () => {
    expect(getRiskLevel(250, "acciones")).toBe("critico");
  });
});

describe("getRiskLevel con umbrales personalizados", () => {
  const personalizados = {
    ...UMBRALES_RIESGO_DEFAULT,
    acciones: { bajo: 1, medio: 2, alto: 4 },
  };

  test.each([
    [1, "bajo"],
    [1.5, "medio"],
    [2, "medio"],
    [3, "alto"],
    [4, "alto"],
    [4.5, "critico"],
  ] as Array<[number, NivelRiesgo]>)(
    "con cortes 1/2/4, %f%% es %s",
    (porcentaje, esperado) => {
      expect(getRiskLevel(porcentaje, "acciones", personalizados)).toBe(esperado);
    }
  );

  test("los umbrales personalizados de una clase no afectan a las otras", () => {
    expect(getRiskLevel(4, "cripto_spot", personalizados)).toBe("bajo");
  });
});
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npm test`
Expected: PASS, 27 tests. Si alguno falla, es un defecto real del semáforo —
anotarlo y consultarlo antes de tocar `riskCalculations.ts`.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts package.json package-lock.json tests/unit/riskCalculations.semaforo.test.ts
git commit -m "test: instalar Vitest y cubrir los bordes del semáforo de riesgo"
```

---

### Task 2: Análisis de riesgo — validación direccional y casos borde

El núcleo de `docs/financial-logic.md`. Incluye los defectos 9.8 y 9.9 del spec,
que nacen en rojo con `test.fails`.

**Files:**
- Create: `tests/unit/riskCalculations.analisis.test.ts`

**Interfaces:**
- Consumes: `analizarRiesgoPosicionFija(inputs)`, `analizarRiesgoApalancado(inputs)`,
  `calcularRatioRiesgoBeneficio(entrada, sl, tp)`, `calcularPnl(tipo, entrada,
  salida, cantidad)`, `calcularPlazoFijo(monto, tna, dias, fechaInicio)`,
  `plazoFijoVencido(fechaVencimiento)` de `@/utils/riskCalculations`.

- [ ] **Step 1: Escribir el test**

Crear `tests/unit/riskCalculations.analisis.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  analizarRiesgoApalancado,
  analizarRiesgoPosicionFija,
  calcularPlazoFijo,
  calcularPnl,
  calcularRatioRiesgoBeneficio,
  plazoFijoVencido,
} from "@/utils/riskCalculations";

describe("validación direccional de Stop Loss y Take Profit", () => {
  const base = { precioEntrada: 100, cantidad: 10 } as const;

  test("Long con Stop Loss por debajo de la entrada es válido", () => {
    const r = analizarRiesgoPosicionFija({
      ...base,
      precioStopLoss: 90,
      tipoOperacion: "long",
    });
    expect(r.riesgoPorUnidad).toBe(10);
  });

  test("Long con Stop Loss por encima de la entrada se rechaza", () => {
    expect(() =>
      analizarRiesgoPosicionFija({ ...base, precioStopLoss: 110, tipoOperacion: "long" })
    ).toThrow(/Long.*Stop Loss debe ser menor/);
  });

  test("Short con Stop Loss por encima de la entrada es válido", () => {
    const r = analizarRiesgoPosicionFija({
      ...base,
      precioStopLoss: 110,
      tipoOperacion: "short",
    });
    expect(r.riesgoPorUnidad).toBe(10);
  });

  test("Short con Stop Loss por debajo de la entrada se rechaza", () => {
    expect(() =>
      analizarRiesgoPosicionFija({ ...base, precioStopLoss: 90, tipoOperacion: "short" })
    ).toThrow(/Short.*Stop Loss debe ser mayor/);
  });

  test("Long con Take Profit por debajo de la entrada se rechaza", () => {
    expect(() =>
      analizarRiesgoPosicionFija({ ...base, precioTakeProfit: 90, tipoOperacion: "long" })
    ).toThrow(/Long.*Take Profit debe ser mayor/);
  });

  test("Short con Take Profit por encima de la entrada se rechaza", () => {
    expect(() =>
      analizarRiesgoPosicionFija({ ...base, precioTakeProfit: 110, tipoOperacion: "short" })
    ).toThrow(/Short.*Take Profit debe ser menor/);
  });
});

describe("casos borde del cálculo", () => {
  test("Stop Loss igual a la entrada lanza error controlado, no Infinity", () => {
    expect(() =>
      analizarRiesgoPosicionFija({
        precioEntrada: 100,
        precioStopLoss: 100,
        cantidad: 10,
        tipoOperacion: "long",
      })
    ).toThrow(/no puede ser igual/);
  });

  test("sin precio de entrada lanza error", () => {
    expect(() =>
      analizarRiesgoPosicionFija({
        precioEntrada: 0,
        cantidad: 10,
        tipoOperacion: "long",
      })
    ).toThrow(/precio de entrada/);
  });

  // Defecto 9.9 del spec: `if (precioStopLoss)` trata el 0 como "sin stop loss",
  // así que un SL de 0 se ignora en silencio en vez de validarse.
  test.fails("un Stop Loss de 0 en un Short se rechaza por dirección", () => {
    expect(() =>
      analizarRiesgoPosicionFija({
        precioEntrada: 100,
        precioStopLoss: 0,
        cantidad: 10,
        tipoOperacion: "short",
      })
    ).toThrow(/Short.*Stop Loss debe ser mayor/);
  });
});

describe("métricas opcionales según los datos cargados", () => {
  const base = {
    precioEntrada: 100,
    cantidad: 10,
    tipoOperacion: "long",
  } as const;

  test("sin Stop Loss ni Take Profit devuelve tamaño y valor de posición", () => {
    const r = analizarRiesgoPosicionFija(base);
    expect(r.tamañoPosicion).toBe(10);
    expect(r.valorPosicion).toBe(1000);
    expect(r.riesgoPorUnidad).toBeUndefined();
    expect(r.ratioRiesgoBeneficio).toBeUndefined();
    expect(r.perdidaMaximaMonetaria).toBeUndefined();
    expect(r.gananciaMaximaMonetaria).toBeUndefined();
  });

  test("solo con Stop Loss calcula pérdida máxima pero no R:R", () => {
    const r = analizarRiesgoPosicionFija({ ...base, precioStopLoss: 90 });
    expect(r.perdidaMaximaMonetaria).toBe(100);
    expect(r.perdidaMaximaPorcentaje).toBe(10);
    expect(r.gananciaMaximaMonetaria).toBeUndefined();
    expect(r.ratioRiesgoBeneficio).toBeUndefined();
  });

  test("solo con Take Profit calcula ganancia máxima pero no R:R", () => {
    const r = analizarRiesgoPosicionFija({ ...base, precioTakeProfit: 120 });
    expect(r.gananciaMaximaMonetaria).toBe(200);
    expect(r.gananciaMaximaPorcentaje).toBe(20);
    expect(r.perdidaMaximaMonetaria).toBeUndefined();
    expect(r.ratioRiesgoBeneficio).toBeUndefined();
  });

  test("con ambos calcula R:R", () => {
    const r = analizarRiesgoPosicionFija({
      ...base,
      precioStopLoss: 90,
      precioTakeProfit: 120,
    });
    expect(r.ratioRiesgoBeneficio).toBe(2);
  });
});

describe("modo apalancado", () => {
  test("el apalancamiento queda embebido en el tamaño de posición", () => {
    const r = analizarRiesgoApalancado({
      precioEntrada: 100,
      monto: 1000,
      apalancamiento: 10,
      tipoOperacion: "long",
    });
    expect(r.tamañoPosicion).toBe(100);
    expect(r.valorPosicion).toBe(10000);
  });

  test("con apalancamiento 1 (spot) el valor de posición es el monto invertido", () => {
    const r = analizarRiesgoApalancado({
      precioEntrada: 250,
      monto: 1000,
      apalancamiento: 1,
      tipoOperacion: "long",
    });
    expect(r.tamañoPosicion).toBe(4);
    expect(r.valorPosicion).toBe(1000);
  });

  test("el % de pérdida máxima no depende del apalancamiento", () => {
    const conApalancamiento = analizarRiesgoApalancado({
      precioEntrada: 100,
      precioStopLoss: 95,
      monto: 1000,
      apalancamiento: 10,
      tipoOperacion: "long",
    });
    expect(conApalancamiento.perdidaMaximaPorcentaje).toBeCloseTo(5, 10);
  });
});

describe("calcularRatioRiesgoBeneficio", () => {
  test("devuelve recompensa sobre riesgo", () => {
    expect(calcularRatioRiesgoBeneficio(100, 90, 130)).toBe(3);
  });

  // Defecto 9.8 del spec: esta función devuelve 0 cuando el riesgo es cero,
  // mientras el núcleo de cálculo lanza error para el mismo caso.
  // `financial-logic.md` documenta el error.
  test.fails("con Stop Loss igual a la entrada lanza error, igual que el núcleo", () => {
    expect(() => calcularRatioRiesgoBeneficio(100, 100, 130)).toThrow();
  });
});

describe("calcularPnl", () => {
  test.each([
    ["long", 100, 120, 10, 200],
    ["long", 100, 80, 10, -200],
    ["short", 100, 80, 10, 200],
    ["short", 100, 120, 10, -200],
  ] as Array<["long" | "short", number, number, number, number]>)(
    "%s de %f a %f por %f unidades da %f",
    (tipo, entrada, salida, cantidad, esperado) => {
      expect(calcularPnl(tipo, entrada, salida, cantidad)).toBe(esperado);
    }
  );
});

describe("calcularPlazoFijo", () => {
  test("interés simple no capitalizable", () => {
    const { interesEstimado } = calcularPlazoFijo(100000, 73, 30, "2026-03-01");
    expect(interesEstimado).toBeCloseTo(6000, 6);
  });

  test("la fecha de vencimiento suma los días al inicio", () => {
    expect(calcularPlazoFijo(1000, 50, 30, "2026-03-01").fechaVencimiento).toBe(
      "2026-03-31"
    );
  });

  test("cruza fin de mes correctamente", () => {
    expect(calcularPlazoFijo(1000, 50, 30, "2026-01-20").fechaVencimiento).toBe(
      "2026-02-19"
    );
  });

  test("cruza fin de año correctamente", () => {
    expect(calcularPlazoFijo(1000, 50, 45, "2026-12-01").fechaVencimiento).toBe(
      "2027-01-15"
    );
  });
});

describe("plazoFijoVencido", () => {
  // Se fija la hora del sistema a las 22:00 de Argentina (UTC-3), momento en que
  // la fecha UTC ya es la del día siguiente. Es el escenario del defecto 9.3.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T01:00:00.000Z")); // 2026-07-28 22:00 ART
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("un plazo vencido ayer está vencido", () => {
    expect(plazoFijoVencido("2026-07-27")).toBe(true);
  });

  // Defecto 9.3 del spec: compara contra la fecha UTC, así que a las 22:00 ART
  // del día 28 ya considera vencido un plazo que vence el 29.
  test.fails("un plazo que vence mañana NO está vencido a las 22:00 de hoy", () => {
    expect(plazoFijoVencido("2026-07-29")).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test**

Run: `npm test -- riskCalculations.analisis`
Expected: PASS. Los tres `test.fails` cuentan como pasados porque efectivamente
fallan. Si alguno de ellos aparece como "expected to fail but passed", significa
que el defecto ya no existe: cambiar `test.fails` por `test` y avisar.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/riskCalculations.analisis.test.ts
git commit -m "test: cubrir análisis de riesgo y marcar los defectos 9.3, 9.8 y 9.9"
```

---

### Task 3: Cuentas, tipo de mercado y política de contraseña

Tres módulos puros y chicos, con test cycle compartido.

**Files:**
- Create: `tests/unit/cuentas.test.ts`
- Create: `tests/unit/tipoMercado.test.ts`
- Create: `tests/unit/passwordPolicy.test.ts`

**Interfaces:**
- Consumes: `cuentaDeTrade(t)`, `cuentaDePlazoFijo(pf)`, `costoOperacion(t)`,
  `comprometidoPorCuenta(trades, plazos)` de `@/utils/cuentas`;
  `admiteOperacion(tipo, operacion)`, `cuentasDeMercado(tipo)` de
  `@/utils/tipoMercado`; `requisitosPasswordFaltantes(pwd)`, `validarPassword(pwd)`
  de `@/utils/passwordPolicy`.
- Produces: el helper local `trade(...)` se redefine en cada archivo que lo
  necesite; no se comparte entre tareas.

- [ ] **Step 1: Escribir `tests/unit/cuentas.test.ts`**

```typescript
import { describe, expect, test } from "vitest";
import {
  comprometidoPorCuenta,
  costoOperacion,
  cuentaDePlazoFijo,
  cuentaDeTrade,
} from "@/utils/cuentas";
import type { PlazoFijo, Trade } from "@/types/trading";

function trade(over: Partial<Trade> = {}): Trade {
  return {
    id: "t1",
    portafolioId: "p1",
    activo: "AAPL",
    tipoActivo: "acciones",
    subTipoActivo: "usd",
    divisa: "USD",
    tipoOperacion: "long",
    fechaEntrada: "2026-07-01",
    precioEntrada: 100,
    cantidad: 10,
    estado: "abierta",
    ...over,
  };
}

function plazo(over: Partial<PlazoFijo> = {}): PlazoFijo {
  return {
    id: "pf1",
    portafolioId: "p1",
    monto: 1000,
    divisa: "ARS",
    tasaTna: 50,
    plazoDias: 30,
    fechaInicio: "2026-07-01",
    fechaVencimiento: "2026-07-31",
    interesEstimado: 41.09,
    estado: "pendiente",
    ...over,
  };
}

describe("cuentaDeTrade", () => {
  test.each([
    ["acciones", "usd", "usd"],
    ["acciones", "cedear", "ars"],
    ["crypto", "spot", "usdt_spot"],
    ["crypto", "futuros", "usdt_futuros"],
  ] as Array<[Trade["tipoActivo"], string, string]>)(
    "%s/%s va a la cuenta %s",
    (tipoActivo, subTipo, esperada) => {
      expect(
        cuentaDeTrade(trade({ tipoActivo, subTipoActivo: subTipo as Trade["subTipoActivo"] }))
      ).toBe(esperada);
    }
  );
});

describe("cuentaDePlazoFijo", () => {
  test("ARS va a la cuenta de pesos", () => {
    expect(cuentaDePlazoFijo(plazo({ divisa: "ARS" }))).toBe("ars");
  });

  test("USD va a la cuenta de dólares", () => {
    expect(cuentaDePlazoFijo(plazo({ divisa: "USD" }))).toBe("usd");
  });
});

describe("costoOperacion", () => {
  test("sin apalancamiento es cantidad por precio", () => {
    expect(costoOperacion(trade({ cantidad: 10, precioEntrada: 100 }))).toBe(1000);
  });

  test("con apalancamiento 10 el costo es el margen", () => {
    expect(
      costoOperacion(trade({ cantidad: 10, precioEntrada: 100, apalancamiento: 10 }))
    ).toBe(100);
  });

  test("apalancamiento 0 se trata como 1, no divide por cero", () => {
    expect(
      costoOperacion(trade({ cantidad: 10, precioEntrada: 100, apalancamiento: 0 }))
    ).toBe(1000);
  });
});

describe("comprometidoPorCuenta", () => {
  test("ignora las operaciones cerradas", () => {
    const totales = comprometidoPorCuenta(
      [
        trade({ id: "a", estado: "abierta" }),
        trade({ id: "b", estado: "cerrada", cantidad: 999 }),
      ],
      []
    );
    expect(totales.usd).toBe(1000);
  });

  test("suma los plazos fijos pendientes a su cuenta", () => {
    const totales = comprometidoPorCuenta([], [plazo({ monto: 5000, divisa: "ARS" })]);
    expect(totales.ars).toBe(5000);
  });

  test("no mezcla divisas entre cuentas", () => {
    const totales = comprometidoPorCuenta(
      [
        trade({ id: "a", tipoActivo: "acciones", subTipoActivo: "cedear", cantidad: 1, precioEntrada: 500 }),
        trade({ id: "b", tipoActivo: "crypto", subTipoActivo: "spot", cantidad: 2, precioEntrada: 300 }),
        trade({ id: "c", tipoActivo: "crypto", subTipoActivo: "futuros", cantidad: 10, precioEntrada: 100, apalancamiento: 5 }),
      ],
      [plazo({ monto: 700, divisa: "USD" })]
    );
    expect(totales).toEqual({
      ars: 500,
      usd: 700,
      usdt_spot: 600,
      usdt_futuros: 200,
    });
  });

  test("sin datos devuelve las cuatro cuentas en cero", () => {
    expect(comprometidoPorCuenta([], [])).toEqual({
      ars: 0,
      usd: 0,
      usdt_spot: 0,
      usdt_futuros: 0,
    });
  });
});
```

- [ ] **Step 2: Escribir `tests/unit/tipoMercado.test.ts`**

```typescript
import { describe, expect, test } from "vitest";
import {
  admiteOperacion,
  cuentasDeMercado,
  type TipoOperacionForm,
} from "@/utils/tipoMercado";
import type { TipoMercadoPortafolio } from "@/types/trading";

/** Matriz completa: 3 tipos de mercado x 3 tipos de operación. */
const MATRIZ: Array<[TipoMercadoPortafolio, TipoOperacionForm, boolean]> = [
  ["acciones", "acciones", true],
  ["acciones", "plazo-fijo", true],
  ["acciones", "crypto", false],
  ["cripto", "crypto", true],
  ["cripto", "acciones", false],
  ["cripto", "plazo-fijo", false],
  ["mixto", "acciones", true],
  ["mixto", "crypto", true],
  ["mixto", "plazo-fijo", true],
];

describe("admiteOperacion", () => {
  test.each(MATRIZ)("portafolio %s con operación %s -> %s", (tipo, op, esperado) => {
    expect(admiteOperacion(tipo, op)).toBe(esperado);
  });
});

describe("cuentasDeMercado", () => {
  test("un portafolio de acciones solo habilita ARS y USD", () => {
    expect(cuentasDeMercado("acciones")).toEqual(["ars", "usd"]);
  });

  test("un portafolio de cripto solo habilita las billeteras USDT", () => {
    expect(cuentasDeMercado("cripto")).toEqual(["usdt_spot", "usdt_futuros"]);
  });

  test("un portafolio mixto habilita las cuatro cuentas", () => {
    expect(cuentasDeMercado("mixto")).toHaveLength(4);
  });
});
```

- [ ] **Step 3: Escribir `tests/unit/passwordPolicy.test.ts`**

```typescript
import { describe, expect, test } from "vitest";
import {
  requisitosPasswordFaltantes,
  validarPassword,
} from "@/utils/passwordPolicy";

describe("requisitosPasswordFaltantes", () => {
  test("una contraseña que cumple todo no tiene faltantes", () => {
    expect(requisitosPasswordFaltantes("Abcdef1!")).toEqual([]);
  });

  test.each([
    ["Abc1!", "al menos 8 caracteres"],
    ["ABCDEF1!", "una minúscula"],
    ["abcdef1!", "una mayúscula"],
    ["Abcdefg!", "un número"],
    ["Abcdefg1", "un carácter especial"],
  ])("%s reporta que falta %s", (password, faltante) => {
    expect(requisitosPasswordFaltantes(password)).toContain(faltante);
  });

  test("una contraseña vacía reporta los cinco requisitos", () => {
    expect(requisitosPasswordFaltantes("")).toHaveLength(5);
  });
});

describe("validarPassword", () => {
  test("devuelve null cuando la contraseña cumple", () => {
    expect(validarPassword("Abcdef1!")).toBeNull();
  });

  test("devuelve un mensaje en registro formal cuando no cumple", () => {
    expect(validarPassword("abc")).toMatch(/^La contraseña debe tener /);
  });
});
```

- [ ] **Step 4: Correr los tres**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/cuentas.test.ts tests/unit/tipoMercado.test.ts tests/unit/passwordPolicy.test.ts
git commit -m "test: cubrir cuentas, tipo de mercado y política de contraseña"
```

---

### Task 4: Saneamiento del importador y la regla de separador de miles

Incluye la decisión del dueño del repo sobre el defecto 9.6: `"1.234"` es mil
doscientos treinta y cuatro. Los tests fijan la regla **por locale**, con
`"es-AR"` aplicando separador de miles y `"en-US"` manteniendo el punto decimal.
Los tests del comportamiento nuevo nacen con `test.fails` porque la firma actual
de `parseNumeroLocale` no recibe locale — el arreglo va en un PR aparte.

**Files:**
- Create: `tests/unit/importExport.sanitize.test.ts`

**Interfaces:**
- Consumes: `normalizarHeader(h)`, `buscarColumna(headers, alias)`,
  `parseNumeroLocale(valor)`, `parseFecha(valor, diaPrimero?)`,
  `limpiarSimbolo(v)`, `simboloBaseCripto(par)`, `parseLado(v)` de
  `@/lib/importExport/sanitize`.
- Produces: fija el contrato futuro `parseNumeroLocale(valor, locale?: "es-AR" |
  "en-US")` con default `"en-US"` — el PR que arregle 9.6 debe respetar esa firma.

- [ ] **Step 1: Escribir el test**

```typescript
import { describe, expect, test } from "vitest";
import {
  buscarColumna,
  limpiarSimbolo,
  normalizarHeader,
  parseFecha,
  parseLado,
  parseNumeroLocale,
  simboloBaseCripto,
} from "@/lib/importExport/sanitize";

describe("normalizarHeader y buscarColumna", () => {
  test("saca acentos, espacios y mayúsculas", () => {
    expect(normalizarHeader("  Descripción  ")).toBe("descripcion");
  });

  test("encuentra la columna por cualquiera de sus alias", () => {
    expect(buscarColumna(["Fecha", "Símbolo", "Cantidad"], ["ticker", "simbolo"])).toBe(1);
  });

  test("devuelve -1 si ningún alias coincide", () => {
    expect(buscarColumna(["Fecha", "Monto"], ["ticker"])).toBe(-1);
  });
});

describe("parseNumeroLocale — formatos que ya funcionan", () => {
  test.each([
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["1234,56", 1234.56],
    ["1234.56", 1234.56],
    ["1234", 1234],
    ["$ 1.234,56", 1234.56],
    ["-500,25", -500.25],
    ["1.234.567,89", 1234567.89],
  ])("interpreta %s como %f", (entrada, esperado) => {
    expect(parseNumeroLocale(entrada)).toBeCloseTo(esperado, 6);
  });

  test.each([["", null], ["   ", null], ["-", null], ["abc", null]])(
    "%s devuelve null",
    (entrada, esperado) => {
      expect(parseNumeroLocale(entrada as string)).toBe(esperado);
    }
  );

  test("un número ya tipado se devuelve tal cual", () => {
    expect(parseNumeroLocale(42.5)).toBe(42.5);
  });

  test("NaN devuelve null", () => {
    expect(parseNumeroLocale(Number.NaN)).toBeNull();
  });
});

// Defecto 9.6 del spec. Decisión del dueño del repo (2026-07-29): en un archivo
// es-AR, "1.234" es mil doscientos treinta y cuatro. La regla se aplica por
// locale para no romper precios cripto de tres decimales en archivos en-US.
describe("parseNumeroLocale — regla de separador de miles por locale", () => {
  test.fails("en es-AR, 1.234 es mil doscientos treinta y cuatro", () => {
    expect(parseNumeroLocale("1.234", "es-AR")).toBe(1234);
  });

  // Tests de GUARDA, no de defecto: la regla de miles aplica solo con
  // exactamente tres dígitos después del punto, así que estos dos casos
  // quedan fuera de ella y ya se comportan bien hoy. Existen para que el
  // arreglo futuro de 9.6 no los rompa. No convertirlos en test.fails.
  test("en es-AR, 1.5 sigue siendo decimal (menos de tres dígitos)", () => {
    expect(parseNumeroLocale("1.5", "es-AR")).toBe(1.5);
  });

  test("en es-AR, 1.2345 sigue siendo decimal (más de tres dígitos)", () => {
    expect(parseNumeroLocale("1.2345", "es-AR")).toBeCloseTo(1.2345, 6);
  });

  test("en en-US, 1.234 sigue siendo un decimal", () => {
    expect(parseNumeroLocale("1.234", "en-US")).toBeCloseTo(1.234, 6);
  });

  test("sin locale explícito se comporta como en-US", () => {
    expect(parseNumeroLocale("1.234")).toBeCloseTo(1.234, 6);
  });
});

describe("parseFecha", () => {
  test.each([
    ["2026-07-01", "2026-07-01"],
    ["2026-07-01 12:30:00", "2026-07-01"],
    ["2026-07-01T12:30:00Z", "2026-07-01"],
    ["01/07/2026", "2026-07-01"],
    ["1/7/2026", "2026-07-01"],
    ["01-07-2026", "2026-07-01"],
    ["01/07/26", "2026-07-01"],
  ])("interpreta %s como %s", (entrada, esperado) => {
    expect(parseFecha(entrada)).toBe(esperado);
  });

  test("con diaPrimero=false interpreta mm/dd/yyyy", () => {
    expect(parseFecha("07/01/2026", false)).toBe("2026-07-01");
  });

  test.each([["", null], ["no es fecha", null], ["13/13/2026", null]])(
    "%s devuelve null",
    (entrada, esperado) => {
      expect(parseFecha(entrada)).toBe(esperado);
    }
  );

  // Defecto 9.7 del spec: valida rangos pero no el calendario, así que devuelve
  // una fecha inexistente que Postgres rechaza después con un error crudo.
  test.fails("una fecha inexistente devuelve null en vez de 2026-02-31", () => {
    expect(parseFecha("31/02/2026")).toBeNull();
  });
});

describe("limpiarSimbolo y simboloBaseCripto", () => {
  test("limpia espacios y pasa a mayúsculas", () => {
    expect(limpiarSimbolo("  aapl ")).toBe("AAPL");
  });

  test.each([
    ["BTC/USDT", "BTC"],
    ["BTC-USDT", "BTC"],
    ["BTC_USDT", "BTC"],
    ["BTCUSDT", "BTC"],
    ["SOLUSDT", "SOL"],
    ["BTCUSD", "BTC"],
    ["ETHBTC", "ETH"],
    ["BTC", "BTC"],
  ])("extrae la base de %s como %s", (par, esperado) => {
    expect(simboloBaseCripto(par)).toBe(esperado);
  });

  test("un valor vacío devuelve cadena vacía", () => {
    expect(simboloBaseCripto("")).toBe("");
  });
});

describe("parseLado", () => {
  test.each(["buy", "Compra", "COMPRAR", "long", "open long", "close short"])(
    "%s es compra",
    (valor) => {
      expect(parseLado(valor)).toBe("compra");
    }
  );

  test.each(["sell", "Venta", "VENDER", "short", "open short", "close long"])(
    "%s es venta",
    (valor) => {
      expect(parseLado(valor)).toBe("venta");
    }
  );

  test("un valor no reconocido devuelve null", () => {
    expect(parseLado("transferencia")).toBeNull();
  });
});
```

- [ ] **Step 2: Ajustar el tipo para que TypeScript acepte el segundo parámetro**

Los cuatro tests de la regla por locale pasan un segundo argumento que la firma
actual no declara, y `tsc` lo rechazaría. Agregar el parámetro opcional a la
firma **sin implementar la regla todavía** (el arreglo va en su propio PR):

En `src/lib/importExport/sanitize.ts`, cambiar la firma de `parseNumeroLocale`:

```typescript
export type LocaleNumero = "es-AR" | "en-US";

export function parseNumeroLocale(
  valor: string | number | undefined | null,
  _locale: LocaleNumero = "en-US"
): number | null {
```

El cuerpo de la función no se toca. El parámetro queda declarado y sin uso, que
es exactamente lo que hace fallar al `test.fails` de la regla de miles es-AR.

- [ ] **Step 3: Correr el test**

Run: `npm test -- importExport.sanitize`
Expected: PASS, con los dos `test.fails` restantes (9.6 y 9.7) fallando como se espera.

- [ ] **Step 4: Verificar que TypeScript sigue limpio**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/importExport.sanitize.test.ts src/lib/importExport/sanitize.ts
git commit -m "test: cubrir saneamiento del importador y fijar la regla de miles es-AR"
```

---

### Task 5: Reconstrucción FIFO

El módulo más difícil de verificar a mano y el que más plata puede desordenar al
importar. Cubre longs, shorts, cierres parciales y vueltas de posición.

**Files:**
- Create: `tests/unit/importExport.fifo.test.ts`

**Interfaces:**
- Consumes: `reconstruirFIFO(movs)` y el tipo `OperacionReconstruida` de
  `@/lib/importExport/fifoReconstruction`; el tipo `MovimientoImportado` de
  `@/lib/importExport/universalOperation`.

- [ ] **Step 1: Leer la definición de `MovimientoImportado`**

Run: `cat src/lib/importExport/universalOperation.ts`
Motivo: el helper del test tiene que construir movimientos válidos. Si algún
campo obligatorio difiere del helper de abajo, ajustarlo antes de seguir.

- [ ] **Step 2: Escribir el test**

```typescript
import { describe, expect, test } from "vitest";
import { reconstruirFIFO } from "@/lib/importExport/fifoReconstruction";
import type { MovimientoImportado } from "@/lib/importExport/universalOperation";

let fila = 0;

function mov(over: Partial<MovimientoImportado> = {}): MovimientoImportado {
  fila += 1;
  return {
    activo: "BTC",
    tipoActivo: "crypto",
    subTipoActivo: "spot",
    divisa: "USDT",
    lado: "compra",
    fecha: "2026-07-01",
    precio: 100,
    cantidad: 1,
    filaOriginal: fila,
    ...over,
  } as MovimientoImportado;
}

describe("reconstruirFIFO — casos simples", () => {
  test("compra seguida de venta arma un long cerrado con su PnL", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "compra", fecha: "2026-07-01", precio: 100, cantidad: 2 }),
      mov({ lado: "venta", fecha: "2026-07-05", precio: 120, cantidad: 2 }),
    ]);

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      tipoOperacion: "long",
      estado: "cerrada",
      precioEntrada: 100,
      precioSalida: 120,
      cantidad: 2,
      fechaEntrada: "2026-07-01",
      fechaSalida: "2026-07-05",
    });
    expect(ops[0].pnlEstimado).toBeCloseTo(40, 6);
  });

  test("venta seguida de compra arma un short cerrado", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "venta", fecha: "2026-07-01", precio: 120, cantidad: 1 }),
      mov({ lado: "compra", fecha: "2026-07-05", precio: 100, cantidad: 1 }),
    ]);

    expect(ops).toHaveLength(1);
    expect(ops[0].tipoOperacion).toBe("short");
    expect(ops[0].estado).toBe("cerrada");
    expect(ops[0].pnlEstimado).toBeCloseTo(20, 6);
  });

  test("una compra sin venta queda como posición abierta", () => {
    const ops = reconstruirFIFO([mov({ lado: "compra", cantidad: 3 })]);

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ estado: "abierta", cantidad: 3, tipoOperacion: "long" });
    expect(ops[0].pnlEstimado).toBeUndefined();
  });
});

describe("reconstruirFIFO — cierres parciales y múltiples lotes", () => {
  test("una venta parcial cierra parte y deja el resto abierto", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "compra", fecha: "2026-07-01", precio: 100, cantidad: 5 }),
      mov({ lado: "venta", fecha: "2026-07-03", precio: 110, cantidad: 2 }),
    ]);

    const cerradas = ops.filter((o) => o.estado === "cerrada");
    const abiertas = ops.filter((o) => o.estado === "abierta");
    expect(cerradas).toHaveLength(1);
    expect(cerradas[0].cantidad).toBe(2);
    expect(abiertas).toHaveLength(1);
    expect(abiertas[0].cantidad).toBe(3);
  });

  test("una venta que consume dos lotes usa primero el más viejo", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "compra", fecha: "2026-07-01", precio: 100, cantidad: 1 }),
      mov({ lado: "compra", fecha: "2026-07-02", precio: 200, cantidad: 1 }),
      mov({ lado: "venta", fecha: "2026-07-03", precio: 300, cantidad: 2 }),
    ]);

    const cerradas = ops.filter((o) => o.estado === "cerrada");
    expect(cerradas).toHaveLength(2);
    // El primero en cerrarse es el lote más viejo (precio 100).
    expect(cerradas[0].precioEntrada).toBe(100);
    expect(cerradas[1].precioEntrada).toBe(200);
    const pnlTotal = cerradas.reduce((acc, o) => acc + (o.pnlEstimado ?? 0), 0);
    expect(pnlTotal).toBeCloseTo(300, 6);
  });

  test("las ejecuciones se ordenan por fecha aunque vengan desordenadas", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "venta", fecha: "2026-07-05", precio: 120, cantidad: 1 }),
      mov({ lado: "compra", fecha: "2026-07-01", precio: 100, cantidad: 1 }),
    ]);

    expect(ops).toHaveLength(1);
    expect(ops[0].tipoOperacion).toBe("long");
    expect(ops[0].fechaEntrada).toBe("2026-07-01");
  });
});

describe("reconstruirFIFO — vuelta de posición", () => {
  test("una venta mayor al inventario cierra el long y abre un short", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "compra", fecha: "2026-07-01", precio: 100, cantidad: 1 }),
      mov({ lado: "venta", fecha: "2026-07-02", precio: 120, cantidad: 3 }),
    ]);

    const cerradas = ops.filter((o) => o.estado === "cerrada");
    const abiertas = ops.filter((o) => o.estado === "abierta");
    expect(cerradas).toHaveLength(1);
    expect(cerradas[0].tipoOperacion).toBe("long");
    expect(cerradas[0].cantidad).toBe(1);
    expect(abiertas).toHaveLength(1);
    expect(abiertas[0].tipoOperacion).toBe("short");
    expect(abiertas[0].cantidad).toBe(2);
  });
});

describe("reconstruirFIFO — separación por libro", () => {
  test("activos distintos no se emparejan entre sí", () => {
    const ops = reconstruirFIFO([
      mov({ activo: "BTC", lado: "compra", cantidad: 1 }),
      mov({ activo: "ETH", lado: "venta", cantidad: 1 }),
    ]);

    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.estado === "abierta")).toBe(true);
  });

  test("el mismo activo en distinta divisa no se empareja", () => {
    const ops = reconstruirFIFO([
      mov({ activo: "AAPL", divisa: "USD", lado: "compra", cantidad: 1 }),
      mov({ activo: "AAPL", divisa: "ARS", lado: "venta", cantidad: 1 }),
    ]);

    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.estado === "abierta")).toBe(true);
  });

  test("cada operación registra las filas del archivo que la originaron", () => {
    const ops = reconstruirFIFO([
      mov({ lado: "compra", fecha: "2026-07-01", filaOriginal: 7 }),
      mov({ lado: "venta", fecha: "2026-07-02", filaOriginal: 9 }),
    ]);

    expect(ops[0].filasOrigen).toEqual([7, 9]);
  });
});
```

- [ ] **Step 3: Correr el test**

Run: `npm test -- importExport.fifo`
Expected: PASS. Si alguno falla, es un defecto real del FIFO: documentarlo con el
mismo formato de la sección 9 del spec y consultarlo antes de tocar el módulo.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/importExport.fifo.test.ts
git commit -m "test: cubrir la reconstrucción FIFO del importador"
```

---

### Task 6: Duplicados y datos de mercado con `fetch` mockeado

Cierra la capa unitaria. Los tests de mercado cumplen el requisito de la sección
7 del spec: **ningún test toca la red**, así que `fetch` se mockea entero y se
verifica el parseo de las respuestas de CoinGecko y Yahoo, incluidos los errores.

**Files:**
- Create: `tests/unit/importExport.dedup.test.ts`
- Create: `tests/unit/marketData.test.ts`

**Interfaces:**
- Consumes: `claveOperacion(o)` y `marcarDuplicados(ops, existentes)` de
  `@/lib/importExport/dedup`; `getAssetPrice(id, type)` y `searchAssets(query,
  tipo?, mercado?)` de `@/lib/marketData`.

- [ ] **Step 1: Escribir el test**

```typescript
import { describe, expect, test } from "vitest";
import { claveOperacion, marcarDuplicados } from "@/lib/importExport/dedup";
import type { OperacionReconstruida } from "@/lib/importExport/fifoReconstruction";
import type { Trade } from "@/types/trading";

function op(over: Partial<OperacionReconstruida> = {}): OperacionReconstruida {
  return {
    activo: "BTC",
    tipoActivo: "crypto",
    subTipoActivo: "spot",
    divisa: "USDT",
    tipoOperacion: "long",
    fechaEntrada: "2026-07-01",
    precioEntrada: 100,
    cantidad: 1,
    estado: "cerrada",
    fechaSalida: "2026-07-05",
    precioSalida: 120,
    filasOrigen: [1, 2],
    ...over,
  };
}

function existente(over: Partial<Trade> = {}): Trade {
  return {
    id: "t1",
    portafolioId: "p1",
    activo: "BTC",
    tipoActivo: "crypto",
    subTipoActivo: "spot",
    divisa: "USDT",
    tipoOperacion: "long",
    fechaEntrada: "2026-07-01",
    precioEntrada: 100,
    cantidad: 1,
    estado: "cerrada",
    fechaSalida: "2026-07-05",
    precioSalida: 120,
    ...over,
  };
}

describe("claveOperacion", () => {
  test("dos operaciones idénticas tienen la misma firma", () => {
    expect(claveOperacion(op())).toBe(claveOperacion(op()));
  });

  test("tolera diferencias de coma flotante", () => {
    expect(claveOperacion(op({ precioEntrada: 100 }))).toBe(
      claveOperacion(op({ precioEntrada: 100.000000001 }))
    );
  });

  test("una abierta y una cerrada del mismo lote NO comparten firma", () => {
    const abierta = op({ estado: "abierta", fechaSalida: undefined, precioSalida: undefined });
    expect(claveOperacion(abierta)).not.toBe(claveOperacion(op()));
  });

  test("distinto precio de salida da distinta firma", () => {
    expect(claveOperacion(op({ precioSalida: 130 }))).not.toBe(claveOperacion(op()));
  });
});

describe("marcarDuplicados", () => {
  test("marca la que ya existe en el portafolio destino", () => {
    expect(marcarDuplicados([op()], [existente()])).toEqual([true]);
  });

  test("no marca una operación nueva", () => {
    expect(marcarDuplicados([op({ precioEntrada: 999 })], [existente()])).toEqual([false]);
  });

  test("marca la segunda aparición dentro del mismo archivo", () => {
    expect(marcarDuplicados([op(), op()], [])).toEqual([false, true]);
  });

  test("sin operaciones existentes, un archivo sin repetidos no marca nada", () => {
    const ops = [op({ activo: "BTC" }), op({ activo: "ETH" }), op({ activo: "SOL" })];
    expect(marcarDuplicados(ops, [])).toEqual([false, false, false]);
  });

  test("devuelve un booleano por cada operación, en el mismo orden", () => {
    const ops = [op({ activo: "BTC" }), op({ activo: "ETH" }), op({ activo: "BTC" })];
    expect(marcarDuplicados(ops, [])).toEqual([false, false, true]);
  });
});
```

- [ ] **Step 2: Correr el test de duplicados**

Run: `npm test -- importExport.dedup`
Expected: PASS.

- [ ] **Step 3: Escribir `tests/unit/marketData.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getAssetPrice, searchAssets } from "@/lib/marketData";

/** Respuesta de fetch armada a mano: ningún test sale a la red. */
function respuesta(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getAssetPrice — cripto (CoinGecko)", () => {
  test("devuelve el precio en USD del id pedido", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta({ bitcoin: { usd: 65000 } }));

    await expect(getAssetPrice("bitcoin", "crypto")).resolves.toEqual({
      price: 65000,
      currency: "USD",
    });
  });

  test("un id inexistente devuelve null en vez de romper", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta({}));

    await expect(getAssetPrice("moneda-que-no-existe", "crypto")).resolves.toBeNull();
  });

  test("una respuesta no-ok devuelve null", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta({}, false, 429));

    await expect(getAssetPrice("bitcoin", "crypto")).resolves.toBeNull();
  });

  test("un error de red devuelve null, no una excepción", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ETIMEDOUT"));

    await expect(getAssetPrice("bitcoin", "crypto")).resolves.toBeNull();
  });

  test("un precio que no es número devuelve null", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta({ bitcoin: { usd: "65000" } }));

    await expect(getAssetPrice("bitcoin", "crypto")).resolves.toBeNull();
  });
});

describe("getAssetPrice — acciones (Yahoo Finance)", () => {
  test("devuelve precio y moneda de la respuesta de Yahoo", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({
        chart: { result: [{ meta: { regularMarketPrice: 230.5, currency: "USD" } }] },
      })
    );

    await expect(getAssetPrice("AAPL", "stock")).resolves.toEqual({
      price: 230.5,
      currency: "USD",
    });
  });

  test("un CEDEAR devuelve la moneda ARS que informa Yahoo", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({
        chart: { result: [{ meta: { regularMarketPrice: 15000, currency: "ARS" } }] },
      })
    );

    await expect(getAssetPrice("AAPL.BA", "stock")).resolves.toEqual({
      price: 15000,
      currency: "ARS",
    });
  });

  test("sin moneda en la respuesta cae a USD", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({ chart: { result: [{ meta: { regularMarketPrice: 100 } }] } })
    );

    await expect(getAssetPrice("AAPL", "stock")).resolves.toEqual({
      price: 100,
      currency: "USD",
    });
  });

  test("una respuesta sin resultados devuelve null", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta({ chart: { result: [] } }));

    await expect(getAssetPrice("NOEXISTE", "stock")).resolves.toBeNull();
  });

  test("un 5xx devuelve null", async () => {
    vi.mocked(fetch).mockResolvedValue(respuesta({}, false, 503));

    await expect(getAssetPrice("AAPL", "stock")).resolves.toBeNull();
  });
});

describe("searchAssets", () => {
  test("con tipo crypto solo consulta CoinGecko y normaliza el símbolo", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({ coins: [{ id: "bitcoin", symbol: "btc", name: "Bitcoin" }] })
    );

    const resultados = await searchAssets("bit", "crypto");

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(resultados).toEqual([
      { id: "bitcoin", symbol: "BTC", name: "Bitcoin", type: "crypto" },
    ]);
  });

  test("con mercado cedear pide el ticker con sufijo .BA", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({
        quotes: [{ symbol: "AAPL.BA", quoteType: "EQUITY", shortname: "Apple CEDEAR" }],
      })
    );

    const resultados = await searchAssets("AAPL", "stock", "cedear");

    const urlPedida = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(urlPedida).toContain("AAPL.BA");
    expect(resultados[0].symbol).toBe("AAPL.BA");
  });

  test("con mercado usd descarta los resultados .BA", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({
        quotes: [
          { symbol: "AAPL", quoteType: "EQUITY", shortname: "Apple Inc." },
          { symbol: "AAPL.BA", quoteType: "EQUITY", shortname: "Apple CEDEAR" },
        ],
      })
    );

    const resultados = await searchAssets("AAPL", "stock", "usd");

    expect(resultados.map((r) => r.symbol)).toEqual(["AAPL"]);
  });

  test("descarta los resultados que no son acciones", async () => {
    vi.mocked(fetch).mockResolvedValue(
      respuesta({
        quotes: [
          { symbol: "AAPL", quoteType: "EQUITY", shortname: "Apple Inc." },
          { symbol: "XYZ", quoteType: "ETF", shortname: "Un ETF" },
        ],
      })
    );

    const resultados = await searchAssets("AAPL", "stock", "usd");

    expect(resultados).toHaveLength(1);
  });

  test("un error de red devuelve lista vacía, no una excepción", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNRESET"));

    await expect(searchAssets("AAPL", "stock")).resolves.toEqual([]);
  });

  test("sin tipo consulta las dos fuentes y concatena", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        respuesta({ coins: [{ id: "bitcoin", symbol: "btc", name: "Bitcoin" }] })
      )
      .mockResolvedValueOnce(
        respuesta({ quotes: [{ symbol: "BIT", quoteType: "EQUITY", shortname: "Bit Co" }] })
      );

    const resultados = await searchAssets("bit");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(resultados.map((r) => r.type)).toEqual(["crypto", "stock"]);
  });
});
```

- [ ] **Step 4: Correr el test de mercado**

Run: `npm test -- marketData`
Expected: PASS. Si alguno falla, verificar primero que el mock esté interceptando
(`fetch` debe estar mockeado antes de importar el módulo bajo prueba; con
`vi.stubGlobal` en `beforeEach` alcanza porque `marketData` usa el `fetch` global
en tiempo de llamada, no lo captura al importar).

- [ ] **Step 5: Correr la suite unitaria entera**

Run: `npm test`
Expected: PASS, con los cinco `test.fails` de las tareas 2 y 4 fallando como se
espera.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/importExport.dedup.test.ts tests/unit/marketData.test.ts
git commit -m "test: cubrir duplicados y datos de mercado con fetch mockeado"
```

---

### Task 7: CI — job rápido

Con la capa unitaria completa, el feedback automático ya vale la pena. Este job
no necesita Docker, así que corre aunque el entorno local todavía no lo tenga.

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: los scripts `test`, `typecheck` y `lint` de `package.json`.
- Produces: el workflow `CI` con el job `rapido`; la tarea 16 le agrega el job
  `completo` al mismo archivo.

- [ ] **Step 1: Crear el workflow**

```yaml
name: CI

on:
  push:
  pull_request:
    branches: [main]

jobs:
  rapido:
    name: Typecheck, lint y tests unitarios
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Instalar dependencias
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      # `npm run lint` NO está en el CI todavía: falla con 5 errores
      # preexistentes de react-hooks/set-state-in-effect en los 4 contexts y
      # en AssetAutocomplete, que ya venían de `main` y no los introdujo la
      # suite. Decisión del dueño del repo (2026-07-29): se arreglan en un PR
      # aparte y recién ahí se suma este paso. Ver docs/testing.md.

      - name: Tests unitarios
        run: npm test
```

- [ ] **Step 2: Verificar localmente los dos comandos del job**

```bash
npm run typecheck && npm test
```

Expected: los dos en verde.

Correr también `npm run lint` para dejar constancia del estado de la deuda:
debe salir con los 5 errores conocidos de `react-hooks/set-state-in-effect` más
el warning esperado del parámetro `_locale`. Si aparece un error **nuevo** que
no esté en esa lista, pararse y consultarlo: significa que la suite introdujo
algo.

- [ ] **Step 3: Commit y push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: agregar job rápido con typecheck, lint y tests unitarios"
git push -u origin feat/suite-de-pruebas
```

- [ ] **Step 4: Verificar que el workflow corrió verde**

```bash
gh run list --branch feat/suite-de-pruebas --limit 1
```

Expected: el run más reciente en `completed / success`. Si falló, leer el log con
`gh run view --log-failed` y arreglar antes de seguir.

---

### Task 8: Supabase local y el harness de tests SQL

Punto de corte del plan: de acá en adelante hace falta Docker. Verificar el
entorno antes de escribir código.

**Files:**
- Create: `scripts/aplicar-migraciones.mjs`
- Create: `tests/setup/entornoSupabase.ts`
- Create: `tests/setup/usuarios.ts`
- Create: `tests/sql/conexion.test.ts`
- Modify: `vitest.config.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces:
  - `entornoSupabase(): { url: string; anonKey: string; serviceRoleKey: string }`
  - `crearUsuarioDePrueba(): Promise<UsuarioDePrueba>` donde
    `UsuarioDePrueba = { userId: string; email: string; portafolioId: string;
    client: SupabaseClient; admin: SupabaseClient }`.
    `client` está autenticado como ese usuario (respeta RLS); `admin` usa
    `service_role` (la saltea, solo para preparar y aseverar estado).
  - Todas las tareas 9 a 13 consumen `crearUsuarioDePrueba`.

- [ ] **Step 1: Verificar los prerrequisitos**

```bash
docker --version && wsl -l -v && supabase --version
```

Expected: los tres responden. Si Docker no está, detener el plan acá: las tareas
1 a 7 ya están entregadas y las 8 a 16 quedan bloqueadas hasta que se instale
(ver sección 11 del spec).

- [ ] **Step 2: Inicializar y levantar Supabase local**

```bash
supabase init
supabase start
```

Expected: imprime API URL (`http://127.0.0.1:54321`), DB URL y las claves. La
primera corrida descarga imágenes y puede tardar varios minutos.

- [ ] **Step 3: Ignorar los artefactos locales de Supabase**

Agregar al final de `.gitignore`:

```
# Supabase local (Docker)
supabase/.branches
supabase/.temp
```

- [ ] **Step 4: Escribir el script que aplica las migraciones en orden**

Crear `scripts/aplicar-migraciones.mjs`. Aplica los `.sql` del repo tal como
están, sin moverlos a `supabase/migrations/`, para no romper el flujo manual del
SQL Editor que usa el dueño del repo.

```javascript
#!/usr/bin/env node
/**
 * Aplica el esquema completo contra la base de Supabase local, en el mismo orden
 * en que el dueño del repo las corre a mano en el SQL Editor.
 *
 * Los .sql se dejan donde están (no se mueven a supabase/migrations/) para no
 * romper ese flujo manual. El psql se ejecuta dentro del contenedor de la base,
 * así no hace falta tener psql instalado en Windows.
 *
 * Uso: node scripts/aplicar-migraciones.mjs
 * Requiere: `supabase start` corriendo.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase";
const DB_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

/** El contenedor se llama supabase_db_<project_id>, definido en config.toml. */
function nombreContenedor() {
  const config = readFileSync(join(DIR, "config.toml"), "utf8");
  const match = config.match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error("No se encontró project_id en supabase/config.toml");
  }
  return `supabase_db_${match[1]}`;
}

// schema.sql primero; después las numeradas, en orden numérico ascendente.
const numeradas = readdirSync(DIR)
  .filter((f) => /^\d{3}_.*\.sql$/.test(f))
  .sort();

const archivos = ["schema.sql", ...numeradas];
const contenedor = nombreContenedor();

for (const archivo of archivos) {
  process.stdout.write(`Aplicando ${archivo}... `);
  execFileSync(
    "docker",
    ["exec", "-i", contenedor, "psql", DB_URL, "-v", "ON_ERROR_STOP=1", "-f", "-"],
    {
      input: readFileSync(join(DIR, archivo), "utf8"),
      stdio: ["pipe", "inherit", "inherit"],
    }
  );
  process.stdout.write("ok\n");
}

console.log(`\n${archivos.length} archivos aplicados.`);
```

Nota sobre el puerto: dentro del contenedor Postgres escucha en el 5432, no en
el 54322 (ese es el mapeo hacia el host). Por eso `DB_URL` usa 5432.

- [ ] **Step 5: Correr el script y verificar el esquema**

```bash
node scripts/aplicar-migraciones.mjs
```

Expected: los 15 archivos en `ok`. Si `007` falla porque `movimientos_futuros` no
existe, es que `005` no se aplicó: revisar el orden que imprimió el script.

- [ ] **Step 6: Escribir `tests/setup/entornoSupabase.ts`**

```typescript
import { execFileSync } from "node:child_process";

interface Entorno {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

let cache: Entorno | null = null;

/**
 * Lee la config de la instancia local con `supabase status`. No se hardcodean
 * las claves: cambian entre versiones de la CLI, y ninguna credencial del
 * proyecto real de Supabase entra en los tests.
 */
export function entornoSupabase(): Entorno {
  if (cache) return cache;

  const salida = execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
  });
  const status = JSON.parse(salida) as Record<string, string>;

  const url = status.API_URL;
  const anonKey = status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "No se pudo leer la config de Supabase local. ¿Corriste `supabase start`?"
    );
  }

  cache = { url, anonKey, serviceRoleKey };
  return cache;
}
```

- [ ] **Step 7: Escribir `tests/setup/usuarios.ts`**

```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { entornoSupabase } from "./entornoSupabase";

export interface UsuarioDePrueba {
  userId: string;
  email: string;
  /** Portafolio creado automáticamente por el trigger handle_new_user. */
  portafolioId: string;
  /** Autenticado como el usuario: respeta RLS. Es el que se usa en los tests. */
  client: SupabaseClient;
  /** service_role: saltea RLS. Solo para preparar y aseverar estado. */
  admin: SupabaseClient;
}

const PASSWORD = "Prueba1234!";

/**
 * Crea un usuario nuevo con email único y devuelve un cliente autenticado.
 * Cada test usa el suyo: el aislamiento lo da RLS, no un truncate entre tests,
 * así que los tests pueden correr en paralelo sin pisarse.
 */
export async function crearUsuarioDePrueba(): Promise<UsuarioDePrueba> {
  const { url, anonKey, serviceRoleKey } = entornoSupabase();

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `test-${randomUUID()}@ejemplo.test`;
  const { data: creado, error: errorAlta } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (errorAlta || !creado.user) {
    throw new Error(`No se pudo crear el usuario de prueba: ${errorAlta?.message}`);
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: errorLogin } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (errorLogin) {
    throw new Error(`No se pudo iniciar sesión: ${errorLogin.message}`);
  }

  // El trigger handle_new_user ya creó "Mi Cuenta Principal" (tipo mixto).
  const { data: portafolios, error: errorPortafolio } = await client
    .from("portafolios")
    .select("id")
    .limit(1);
  if (errorPortafolio || !portafolios?.length) {
    throw new Error(
      `El trigger handle_new_user no creó el portafolio por defecto: ${errorPortafolio?.message}`
    );
  }

  return {
    userId: creado.user.id,
    email,
    portafolioId: portafolios[0].id as string,
    client,
    admin,
  };
}

/** Lee el disponible de una cuenta. Devuelve 0 si la fila no existe todavía. */
export async function disponibleDe(
  u: UsuarioDePrueba,
  cuenta: string
): Promise<number> {
  const { data } = await u.client
    .from("cuentas_saldos")
    .select("disponible")
    .eq("portafolio_id", u.portafolioId)
    .eq("cuenta", cuenta)
    .maybeSingle();
  return data ? Number(data.disponible) : 0;
}
```

- [ ] **Step 8: Agregar el proyecto `sql` a `vitest.config.ts`**

Reemplazar el bloque `test` por:

```typescript
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "sql",
          include: ["tests/sql/**/*.test.ts"],
          environment: "node",
          // Las RPC van y vuelven por HTTP contra Docker: más lentas que un test puro.
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
```

Y agregar a `package.json`:

```json
"test:sql": "vitest run --project sql",
"db:reset": "supabase db reset --no-seed && node scripts/aplicar-migraciones.mjs"
```

Nota: `npm test` sigue corriendo solo el proyecto `unit` si se lo invoca con
`--project unit`. Cambiar el script `test` a `"vitest run --project unit"` para
que el job rápido de CI no intente hablar con Docker.

- [ ] **Step 9: Escribir el test de humo del harness**

Crear `tests/sql/conexion.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { crearUsuarioDePrueba } from "../setup/usuarios";

describe("harness de Supabase local", () => {
  test("crea un usuario con su portafolio por defecto", async () => {
    const u = await crearUsuarioDePrueba();

    expect(u.userId).toBeTruthy();
    expect(u.portafolioId).toBeTruthy();

    const { data } = await u.client
      .from("portafolios")
      .select("nombre, tipo_mercado")
      .eq("id", u.portafolioId)
      .single();

    expect(data?.nombre).toBe("Mi Cuenta Principal");
    expect(data?.tipo_mercado).toBe("mixto");
  });

  test("dos usuarios de prueba son distintos entre sí", async () => {
    const [a, b] = await Promise.all([crearUsuarioDePrueba(), crearUsuarioDePrueba()]);
    expect(a.userId).not.toBe(b.userId);
    expect(a.portafolioId).not.toBe(b.portafolioId);
  });
});
```

- [ ] **Step 10: Correr el test de humo**

Run: `npm run test:sql`
Expected: PASS, 2 tests.

- [ ] **Step 11: Commit**

```bash
git add scripts/aplicar-migraciones.mjs tests/setup tests/sql/conexion.test.ts vitest.config.ts package.json .gitignore supabase/config.toml
git commit -m "test: levantar Supabase local y armar el harness de tests SQL"
```

---

### Task 9: RPC de saldos — `set_saldo_inicial` y `registrar_movimiento_cuenta`

Las dos funciones que **sí** validan el signo del monto. Sirven de línea base
antes de atacar las tres que no lo hacen.

**Files:**
- Create: `tests/sql/saldos.test.ts`

**Interfaces:**
- Consumes: `crearUsuarioDePrueba()` y `disponibleDe(u, cuenta)` de
  `../setup/usuarios`.

- [ ] **Step 1: Escribir el test**

```typescript
import { describe, expect, test } from "vitest";
import { crearUsuarioDePrueba, disponibleDe } from "../setup/usuarios";

describe("set_saldo_inicial", () => {
  test("fija el disponible y deja un movimiento de ajuste inicial", async () => {
    const u = await crearUsuarioDePrueba();

    const { error } = await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_monto: 100000,
    });

    expect(error).toBeNull();
    expect(await disponibleDe(u, "ars")).toBe(100000);

    const { data: movs } = await u.client
      .from("movimientos_cuenta")
      .select("tipo, monto")
      .eq("portafolio_id", u.portafolioId);

    expect(movs).toHaveLength(1);
    expect(movs?.[0].tipo).toBe("ajuste_inicial");
    expect(Number(movs?.[0].monto)).toBe(100000);
  });

  test("volver a fijarlo reemplaza el disponible, no lo suma", async () => {
    const u = await crearUsuarioDePrueba();

    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usd",
      p_monto: 500,
    });
    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usd",
      p_monto: 800,
    });

    expect(await disponibleDe(u, "usd")).toBe(800);
  });

  test("rechaza un monto negativo", async () => {
    const u = await crearUsuarioDePrueba();

    const { error } = await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_monto: -100,
    });

    expect(error?.message).toMatch(/MONTO_INVALIDO/);
    expect(await disponibleDe(u, "ars")).toBe(0);
  });
});

describe("registrar_movimiento_cuenta", () => {
  async function conSaldo(cuenta: string, monto: number) {
    const u = await crearUsuarioDePrueba();
    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: cuenta,
      p_monto: monto,
    });
    return u;
  }

  test("un depósito suma al disponible", async () => {
    const u = await conSaldo("ars", 1000);

    const { error } = await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_tipo: "deposito",
      p_monto: 500,
      p_fecha: "2026-07-01",
      p_notas: "Depósito de prueba",
    });

    expect(error).toBeNull();
    expect(await disponibleDe(u, "ars")).toBe(1500);
  });

  test("un retiro resta del disponible y se guarda con signo negativo", async () => {
    const u = await conSaldo("ars", 1000);

    await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_tipo: "retiro",
      p_monto: 300,
      p_fecha: "2026-07-01",
      p_notas: null,
    });

    expect(await disponibleDe(u, "ars")).toBe(700);

    const { data: movs } = await u.client
      .from("movimientos_cuenta")
      .select("tipo, monto")
      .eq("tipo", "retiro");

    expect(Number(movs?.[0].monto)).toBe(-300);
  });

  test("un retiro mayor al disponible falla y no deja rastro", async () => {
    const u = await conSaldo("ars", 100);

    const { error } = await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_tipo: "retiro",
      p_monto: 500,
      p_fecha: "2026-07-01",
      p_notas: null,
    });

    expect(error?.message).toMatch(/FONDOS_INSUFICIENTES:ars/);
    expect(await disponibleDe(u, "ars")).toBe(100);

    const { data: movs } = await u.client
      .from("movimientos_cuenta")
      .select("tipo")
      .eq("tipo", "retiro");

    expect(movs).toHaveLength(0);
  });

  test("rechaza un tipo de movimiento inválido", async () => {
    const u = await conSaldo("ars", 1000);

    const { error } = await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_tipo: "transferencia",
      p_monto: 100,
      p_fecha: "2026-07-01",
      p_notas: null,
    });

    expect(error?.message).toMatch(/TIPO_INVALIDO/);
  });

  test("rechaza un monto de cero o negativo", async () => {
    const u = await conSaldo("ars", 1000);

    for (const monto of [0, -50]) {
      const { error } = await u.client.rpc("registrar_movimiento_cuenta", {
        p_portafolio_id: u.portafolioId,
        p_cuenta: "ars",
        p_tipo: "deposito",
        p_monto: monto,
        p_fecha: "2026-07-01",
        p_notas: null,
      });
      expect(error?.message).toMatch(/MONTO_INVALIDO/);
    }

    expect(await disponibleDe(u, "ars")).toBe(1000);
  });

  test("rechaza una fecha futura", async () => {
    const u = await conSaldo("ars", 1000);
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const { error } = await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_tipo: "deposito",
      p_monto: 100,
      p_fecha: manana,
      p_notas: null,
    });

    expect(error?.message).toMatch(/FECHA_FUTURA/);
  });
});
```

- [ ] **Step 2: Correr el test**

Run: `npm run test:sql -- saldos`
Expected: PASS. El test de fecha futura depende de la migración `010`: si falla,
verificar que el script de migraciones la aplicó.

- [ ] **Step 3: Commit**

```bash
git add tests/sql/saldos.test.ts
git commit -m "test(sql): cubrir set_saldo_inicial y registrar_movimiento_cuenta"
```

---

### Task 10: `abrir_operacion` — incluye el defecto P0 de creación de dinero

**Files:**
- Create: `tests/sql/abrirOperacion.test.ts`

**Interfaces:**
- Consumes: `crearUsuarioDePrueba()`, `disponibleDe(u, cuenta)`.
- Produces: el helper local `abrir(u, over)` se replica en la tarea 11; no se
  comparte entre archivos a propósito, para que cada test se lea solo.

- [ ] **Step 1: Escribir el test**

```typescript
import { describe, expect, test } from "vitest";
import { crearUsuarioDePrueba, disponibleDe, type UsuarioDePrueba } from "../setup/usuarios";

/** Parámetros de una operación de acciones USD, sobreescribibles por test. */
function params(u: UsuarioDePrueba, over: Record<string, unknown> = {}) {
  return {
    p_portafolio_id: u.portafolioId,
    p_activo: "AAPL",
    p_tipo_activo: "acciones",
    p_sub_tipo_activo: "usd",
    p_divisa: "USD",
    p_apalancamiento: null,
    p_tipo_operacion: "long",
    p_fecha_entrada: "2026-07-01",
    p_precio_entrada: 100,
    p_precio_stop_loss: 90,
    p_precio_take_profit: 130,
    p_cantidad: 10,
    p_ratio_riesgo_beneficio: 3,
    p_porcentaje_riesgo: 10,
    p_notas: null,
    ...over,
  };
}

async function conSaldo(cuenta: string, monto: number) {
  const u = await crearUsuarioDePrueba();
  await u.client.rpc("set_saldo_inicial", {
    p_portafolio_id: u.portafolioId,
    p_cuenta: cuenta,
    p_monto: monto,
  });
  return u;
}

describe("abrir_operacion — camino feliz", () => {
  test("descuenta exactamente cantidad x precio de la cuenta USD", async () => {
    const u = await conSaldo("usd", 5000);

    const { data: opId, error } = await u.client.rpc("abrir_operacion", params(u));

    expect(error).toBeNull();
    expect(opId).toBeTruthy();
    expect(await disponibleDe(u, "usd")).toBe(4000);
  });

  test("deja la operación abierta con sus datos", async () => {
    const u = await conSaldo("usd", 5000);
    const { data: opId } = await u.client.rpc("abrir_operacion", params(u));

    const { data: op } = await u.client
      .from("operaciones")
      .select("estado, cantidad, precio_entrada, activo")
      .eq("id", opId)
      .single();

    expect(op).toMatchObject({ estado: "abierta", activo: "AAPL" });
    expect(Number(op?.cantidad)).toBe(10);
  });

  test("registra un movimiento de apertura con monto negativo", async () => {
    const u = await conSaldo("usd", 5000);
    const { data: opId } = await u.client.rpc("abrir_operacion", params(u));

    const { data: mov } = await u.client
      .from("movimientos_cuenta")
      .select("tipo, monto, ref_operacion_id")
      .eq("tipo", "apertura")
      .single();

    expect(Number(mov?.monto)).toBe(-1000);
    expect(mov?.ref_operacion_id).toBe(opId);
  });

  test("en futuros descuenta el margen, no el nocional", async () => {
    const u = await conSaldo("usdt_futuros", 5000);

    await u.client.rpc(
      "abrir_operacion",
      params(u, {
        p_tipo_activo: "crypto",
        p_sub_tipo_activo: "futuros",
        p_divisa: "USDT",
        p_apalancamiento: 10,
        p_activo: "BTC",
      })
    );

    // cantidad 10 x precio 100 / apalancamiento 10 = 100 de margen.
    expect(await disponibleDe(u, "usdt_futuros")).toBe(4900);
  });

  test.each([
    ["acciones", "usd", "usd", "USD"],
    ["acciones", "cedear", "ars", "ARS"],
    ["crypto", "spot", "usdt_spot", "USDT"],
    ["crypto", "futuros", "usdt_futuros", "USDT"],
  ])(
    "%s/%s debita la cuenta %s",
    async (tipoActivo, subTipo, cuenta, divisa) => {
      const u = await conSaldo(cuenta, 5000);

      await u.client.rpc(
        "abrir_operacion",
        params(u, {
          p_tipo_activo: tipoActivo,
          p_sub_tipo_activo: subTipo,
          p_divisa: divisa,
          p_apalancamiento: null,
        })
      );

      expect(await disponibleDe(u, cuenta)).toBe(4000);
    }
  );
});

describe("abrir_operacion — atomicidad", () => {
  test("sin fondos falla y no deja operación, movimiento ni cambio de saldo", async () => {
    const u = await conSaldo("usd", 500);

    const { error } = await u.client.rpc("abrir_operacion", params(u));

    expect(error?.message).toMatch(/FONDOS_INSUFICIENTES:usd/);
    expect(await disponibleDe(u, "usd")).toBe(500);

    const { data: ops } = await u.client.from("operaciones").select("id");
    expect(ops).toHaveLength(0);

    const { data: movs } = await u.client
      .from("movimientos_cuenta")
      .select("id")
      .eq("tipo", "apertura");
    expect(movs).toHaveLength(0);
  });

  test("sin saldo cargado en la cuenta se comporta como saldo cero", async () => {
    const u = await crearUsuarioDePrueba();

    const { error } = await u.client.rpc("abrir_operacion", params(u));

    expect(error?.message).toMatch(/FONDOS_INSUFICIENTES:usd/);
  });
});

describe("abrir_operacion — validaciones", () => {
  test("rechaza una fecha de entrada futura", async () => {
    const u = await conSaldo("usd", 5000);
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const { error } = await u.client.rpc(
      "abrir_operacion",
      params(u, { p_fecha_entrada: manana })
    );

    expect(error?.message).toMatch(/FECHA_FUTURA/);
    expect(await disponibleDe(u, "usd")).toBe(5000);
  });

  // Defecto 9.1 del spec — P0. Con cantidad negativa, v_costo da negativo, la
  // guarda de fondos pasa siempre, y `disponible - v_costo` SUMA al saldo.
  // La RPC es security definer y está otorgada a `authenticated`: cualquier
  // usuario logueado la llama directo, sin pasar por el formulario.
  test.fails("rechaza una cantidad negativa en vez de acreditar saldo", async () => {
    const u = await conSaldo("usd", 1000);

    const { error } = await u.client.rpc(
      "abrir_operacion",
      params(u, { p_cantidad: -1000 })
    );

    expect(error?.message).toMatch(/MONTO_INVALIDO/);
    expect(await disponibleDe(u, "usd")).toBe(1000);
  });

  test.fails("rechaza un precio de entrada negativo", async () => {
    const u = await conSaldo("usd", 1000);

    const { error } = await u.client.rpc(
      "abrir_operacion",
      params(u, { p_precio_entrada: -100 })
    );

    expect(error?.message).toMatch(/MONTO_INVALIDO/);
    expect(await disponibleDe(u, "usd")).toBe(1000);
  });

  test.fails("rechaza una cantidad de cero", async () => {
    const u = await conSaldo("usd", 1000);

    const { error } = await u.client.rpc("abrir_operacion", params(u, { p_cantidad: 0 }));

    expect(error?.message).toMatch(/MONTO_INVALIDO/);
  });
});
```

- [ ] **Step 2: Correr el test**

Run: `npm run test:sql -- abrirOperacion`
Expected: PASS. Los tres `test.fails` del defecto 9.1 deben fallar. **Si alguno
pasa inesperadamente, la RPC ya fue arreglada** — cambiar a `test` y avisar.

- [ ] **Step 3: Confirmar a mano la severidad del defecto 9.1**

Para dejar constancia del impacto real, correr una vez y anotar el resultado en
el PR (no queda en el repo):

```bash
npm run test:sql -- abrirOperacion --reporter=verbose
```

Expected: el test de cantidad negativa falla porque el saldo terminó en 1.001.000
en vez de 1000 — es decir, la RPC acreditó un millón inexistente.

- [ ] **Step 4: Commit**

```bash
git add tests/sql/abrirOperacion.test.ts
git commit -m "test(sql): cubrir abrir_operacion y exponer el defecto 9.1 (creación de dinero)"
```

---

### Task 11: `cerrar_operacion` — total, parcial y los defectos 9.4 y 9.5

**Files:**
- Create: `tests/sql/cerrarOperacion.test.ts`

**Interfaces:**
- Consumes: `crearUsuarioDePrueba()`, `disponibleDe(u, cuenta)`.

- [ ] **Step 1: Escribir el test**

```typescript
import { describe, expect, test } from "vitest";
import { crearUsuarioDePrueba, disponibleDe } from "../setup/usuarios";

async function conOperacionAbierta(over: Record<string, unknown> = {}) {
  const u = await crearUsuarioDePrueba();
  await u.client.rpc("set_saldo_inicial", {
    p_portafolio_id: u.portafolioId,
    p_cuenta: "usd",
    p_monto: 5000,
  });

  const { data: opId } = await u.client.rpc("abrir_operacion", {
    p_portafolio_id: u.portafolioId,
    p_activo: "AAPL",
    p_tipo_activo: "acciones",
    p_sub_tipo_activo: "usd",
    p_divisa: "USD",
    p_apalancamiento: null,
    p_tipo_operacion: "long",
    p_fecha_entrada: "2026-07-01",
    p_precio_entrada: 100,
    p_precio_stop_loss: 90,
    p_precio_take_profit: 130,
    p_cantidad: 10,
    p_ratio_riesgo_beneficio: 3,
    p_porcentaje_riesgo: 10,
    p_notas: null,
    ...over,
  });

  return { u, opId: opId as string };
}

describe("cerrar_operacion — cierre total", () => {
  test("acredita costo + P&L y marca la operación cerrada", async () => {
    const { u, opId } = await conOperacionAbierta();
    // Tras abrir: 5000 - 1000 = 4000 disponible.

    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });

    expect(error).toBeNull();
    // proceeds = costo 1000 + pnl 200 = 1200. 4000 + 1200 = 5200.
    expect(await disponibleDe(u, "usd")).toBe(5200);

    const { data: op } = await u.client
      .from("operaciones")
      .select("estado, resultado_pnl, precio_salida")
      .eq("id", opId)
      .single();

    expect(op?.estado).toBe("cerrada");
    expect(Number(op?.resultado_pnl)).toBe(200);
  });

  test("una operación perdedora acredita menos que el costo", async () => {
    const { u, opId } = await conOperacionAbierta();

    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 80,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });

    // proceeds = 1000 + (-200) = 800. 4000 + 800 = 4800.
    expect(await disponibleDe(u, "usd")).toBe(4800);
  });

  test("un short gana cuando el precio baja", async () => {
    const u = await crearUsuarioDePrueba();
    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usdt_futuros",
      p_monto: 5000,
    });
    const { data: opId } = await u.client.rpc("abrir_operacion", {
      p_portafolio_id: u.portafolioId,
      p_activo: "BTC",
      p_tipo_activo: "crypto",
      p_sub_tipo_activo: "futuros",
      p_divisa: "USDT",
      p_apalancamiento: 10,
      p_tipo_operacion: "short",
      p_fecha_entrada: "2026-07-01",
      p_precio_entrada: 100,
      p_precio_stop_loss: 110,
      p_precio_take_profit: 80,
      p_cantidad: 10,
      p_ratio_riesgo_beneficio: 2,
      p_porcentaje_riesgo: 1,
      p_notas: null,
    });

    // margen = 10 x 100 / 10 = 100. Disponible tras abrir: 4900.
    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 80,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });

    // pnl = (100 - 80) x 10 = 200. proceeds = margen 100 + 200 = 300.
    expect(await disponibleDe(u, "usdt_futuros")).toBe(5200);
  });
});

describe("cerrar_operacion — cierre parcial", () => {
  test("reduce la original y crea una fila cerrada por la porción", async () => {
    const { u, opId } = await conOperacionAbierta();

    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 4,
    });

    const { data: original } = await u.client
      .from("operaciones")
      .select("estado, cantidad")
      .eq("id", opId)
      .single();

    expect(original?.estado).toBe("abierta");
    expect(Number(original?.cantidad)).toBe(6);

    const { data: cerradas } = await u.client
      .from("operaciones")
      .select("cantidad, resultado_pnl")
      .eq("estado", "cerrada");

    expect(cerradas).toHaveLength(1);
    expect(Number(cerradas?.[0].cantidad)).toBe(4);
    expect(Number(cerradas?.[0].resultado_pnl)).toBe(80);
  });

  test("acredita solo la porción cerrada", async () => {
    const { u, opId } = await conOperacionAbierta();

    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 4,
    });

    // proceeds = costo 400 + pnl 80 = 480. 4000 + 480 = 4480.
    expect(await disponibleDe(u, "usd")).toBe(4480);
  });

  test("cerrar el resto deja la operación original cerrada", async () => {
    const { u, opId } = await conOperacionAbierta();

    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 4,
    });
    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-11",
      p_cantidad_cerrada: 6,
    });

    const { data: op } = await u.client
      .from("operaciones")
      .select("estado")
      .eq("id", opId)
      .single();

    expect(op?.estado).toBe("cerrada");
    // El total acreditado equivale a haber cerrado todo de una: 5200.
    expect(await disponibleDe(u, "usd")).toBe(5200);
  });
});

describe("cerrar_operacion — validaciones", () => {
  test("rechaza cerrar dos veces la misma operación", async () => {
    const { u, opId } = await conOperacionAbierta();

    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });
    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });

    expect(error?.message).toMatch(/OPERACION_YA_CERRADA/);
    expect(await disponibleDe(u, "usd")).toBe(5200);
  });

  test.each([0, -5, 11])("rechaza cerrar una cantidad de %d", async (cantidad) => {
    const { u, opId } = await conOperacionAbierta();

    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: cantidad,
    });

    expect(error?.message).toMatch(/CANTIDAD_INVALIDA/);
    expect(await disponibleDe(u, "usd")).toBe(4000);
  });

  test("rechaza una operación inexistente", async () => {
    const { u } = await conOperacionAbierta();

    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: "00000000-0000-0000-0000-000000000000",
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 1,
    });

    expect(error?.message).toMatch(/OPERACION_NO_ENCONTRADA/);
  });

  test("rechaza una fecha de salida futura", async () => {
    const { u, opId } = await conOperacionAbierta();
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: manana,
      p_cantidad_cerrada: 10,
    });

    expect(error?.message).toMatch(/FECHA_FUTURA/);
  });

  // Defecto 9.4 del spec: solo valida contra current_date, nunca contra
  // op.fecha_entrada, así que permite cerrar antes de haber abierto.
  test.fails("rechaza una fecha de salida anterior a la de entrada", async () => {
    const { u, opId } = await conOperacionAbierta();

    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 120,
      p_fecha_salida: "2026-06-01", // la entrada fue el 2026-07-01
      p_cantidad_cerrada: 10,
    });

    expect(error?.message).toMatch(/FECHA_INVALIDA/);
  });

  // Defecto 9.5 del spec — P0. Sin guarda sobre p_precio_salida: en un short,
  // (precio_entrada - p_precio_salida) con salida negativa infla el P&L y
  // acredita ese monto inexistente al disponible.
  test.fails("rechaza un precio de salida negativo", async () => {
    const { u, opId } = await conOperacionAbierta();

    const { error } = await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: -1000,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });

    expect(error?.message).toMatch(/MONTO_INVALIDO/);
    expect(await disponibleDe(u, "usd")).toBe(4000);
  });
});
```

- [ ] **Step 2: Correr el test**

Run: `npm run test:sql -- cerrarOperacion`
Expected: PASS, con los dos `test.fails` fallando.

- [ ] **Step 3: Commit**

```bash
git add tests/sql/cerrarOperacion.test.ts
git commit -m "test(sql): cubrir cerrar_operacion total y parcial, exponer defectos 9.4 y 9.5"
```

---

### Task 12: Plazos fijos — `abrir_plazo_fijo` y `liquidar_plazo_fijo`

**Files:**
- Create: `tests/sql/plazosFijos.test.ts`

**Interfaces:**
- Consumes: `crearUsuarioDePrueba()`, `disponibleDe(u, cuenta)`.

- [ ] **Step 1: Escribir el test**

```typescript
import { describe, expect, test } from "vitest";
import { crearUsuarioDePrueba, disponibleDe, type UsuarioDePrueba } from "../setup/usuarios";

async function conSaldoARS(monto = 100000) {
  const u = await crearUsuarioDePrueba();
  await u.client.rpc("set_saldo_inicial", {
    p_portafolio_id: u.portafolioId,
    p_cuenta: "ars",
    p_monto: monto,
  });
  return u;
}

function paramsPlazo(u: UsuarioDePrueba, over: Record<string, unknown> = {}) {
  return {
    p_portafolio_id: u.portafolioId,
    p_monto: 50000,
    p_divisa: "ARS",
    p_tasa_tna: 73,
    p_plazo_dias: 30,
    p_fecha_inicio: "2026-07-01",
    p_fecha_vencimiento: "2026-07-31",
    p_interes_estimado: 3000,
    p_notas: null,
    ...over,
  };
}

describe("abrir_plazo_fijo", () => {
  test("debita el monto de la cuenta de la divisa", async () => {
    const u = await conSaldoARS();

    const { data: id, error } = await u.client.rpc("abrir_plazo_fijo", paramsPlazo(u));

    expect(error).toBeNull();
    expect(id).toBeTruthy();
    expect(await disponibleDe(u, "ars")).toBe(50000);
  });

  test("deja el plazo en estado pendiente y su movimiento de apertura", async () => {
    const u = await conSaldoARS();
    const { data: id } = await u.client.rpc("abrir_plazo_fijo", paramsPlazo(u));

    const { data: pf } = await u.client
      .from("plazos_fijos")
      .select("estado, monto")
      .eq("id", id)
      .single();
    expect(pf?.estado).toBe("pendiente");

    const { data: mov } = await u.client
      .from("movimientos_cuenta")
      .select("tipo, monto, ref_operacion_id")
      .eq("tipo", "plazo_apertura")
      .single();
    expect(Number(mov?.monto)).toBe(-50000);
    expect(mov?.ref_operacion_id).toBe(id);
  });

  test("un plazo en USD debita la cuenta de dólares", async () => {
    const u = await crearUsuarioDePrueba();
    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usd",
      p_monto: 1000,
    });

    await u.client.rpc(
      "abrir_plazo_fijo",
      paramsPlazo(u, { p_divisa: "USD", p_monto: 400, p_interes_estimado: 20 })
    );

    expect(await disponibleDe(u, "usd")).toBe(600);
  });

  test("sin fondos falla y no deja plazo ni movimiento", async () => {
    const u = await conSaldoARS(1000);

    const { error } = await u.client.rpc("abrir_plazo_fijo", paramsPlazo(u));

    expect(error?.message).toMatch(/FONDOS_INSUFICIENTES:ars/);
    expect(await disponibleDe(u, "ars")).toBe(1000);

    const { data: plazos } = await u.client.from("plazos_fijos").select("id");
    expect(plazos).toHaveLength(0);
  });

  // Defecto 9.2 del spec — P0. Mismo agujero que 9.1: un monto negativo pasa la
  // validación de fondos y acredita al disponible.
  test.fails("rechaza un monto negativo en vez de acreditar saldo", async () => {
    const u = await conSaldoARS(1000);

    const { error } = await u.client.rpc(
      "abrir_plazo_fijo",
      paramsPlazo(u, { p_monto: -100000 })
    );

    expect(error?.message).toMatch(/MONTO_INVALIDO/);
    expect(await disponibleDe(u, "ars")).toBe(1000);
  });
});

describe("liquidar_plazo_fijo", () => {
  test("acredita monto + interés y marca el plazo liquidado", async () => {
    const u = await conSaldoARS();
    const { data: id } = await u.client.rpc("abrir_plazo_fijo", paramsPlazo(u));

    const { error } = await u.client.rpc("liquidar_plazo_fijo", { p_id: id });

    expect(error).toBeNull();
    // 50000 restante + 50000 capital + 3000 interés.
    expect(await disponibleDe(u, "ars")).toBe(103000);

    const { data: pf } = await u.client
      .from("plazos_fijos")
      .select("estado")
      .eq("id", id)
      .single();
    expect(pf?.estado).toBe("liquidado");
  });

  test("rechaza liquidar dos veces", async () => {
    const u = await conSaldoARS();
    const { data: id } = await u.client.rpc("abrir_plazo_fijo", paramsPlazo(u));

    await u.client.rpc("liquidar_plazo_fijo", { p_id: id });
    const { error } = await u.client.rpc("liquidar_plazo_fijo", { p_id: id });

    expect(error?.message).toMatch(/PLAZO_YA_LIQUIDADO/);
    expect(await disponibleDe(u, "ars")).toBe(103000);
  });

  test("rechaza un plazo inexistente", async () => {
    const u = await conSaldoARS();

    const { error } = await u.client.rpc("liquidar_plazo_fijo", {
      p_id: "00000000-0000-0000-0000-000000000000",
    });

    expect(error?.message).toMatch(/PLAZO_NO_ENCONTRADO/);
  });
});
```

- [ ] **Step 2: Correr el test**

Run: `npm run test:sql -- plazosFijos`
Expected: PASS, con el `test.fails` del defecto 9.2 fallando.

- [ ] **Step 3: Commit**

```bash
git add tests/sql/plazosFijos.test.ts
git commit -m "test(sql): cubrir plazos fijos y exponer el defecto 9.2"
```

---

### Task 13: RLS, append-only e invariante contable

El test P0 de aislamiento y el que valida que saldo y ledger nunca se separen.

**Files:**
- Create: `tests/sql/rls.test.ts`
- Create: `tests/sql/invarianteContable.test.ts`

**Interfaces:**
- Consumes: `crearUsuarioDePrueba()`, `disponibleDe(u, cuenta)`.

- [ ] **Step 1: Escribir `tests/sql/rls.test.ts`**

```typescript
import { beforeAll, describe, expect, test } from "vitest";
import { crearUsuarioDePrueba, type UsuarioDePrueba } from "../setup/usuarios";

/**
 * A tiene datos cargados; B es un usuario cualquiera. B no debe poder ver ni
 * tocar nada de A por ninguna vía: lectura directa, escritura directa, o RPC.
 */
let A: UsuarioDePrueba;
let B: UsuarioDePrueba;
let opIdDeA: string;

beforeAll(async () => {
  [A, B] = await Promise.all([crearUsuarioDePrueba(), crearUsuarioDePrueba()]);

  await A.client.rpc("set_saldo_inicial", {
    p_portafolio_id: A.portafolioId,
    p_cuenta: "usd",
    p_monto: 5000,
  });
  const { data } = await A.client.rpc("abrir_operacion", {
    p_portafolio_id: A.portafolioId,
    p_activo: "AAPL",
    p_tipo_activo: "acciones",
    p_sub_tipo_activo: "usd",
    p_divisa: "USD",
    p_apalancamiento: null,
    p_tipo_operacion: "long",
    p_fecha_entrada: "2026-07-01",
    p_precio_entrada: 100,
    p_precio_stop_loss: 90,
    p_precio_take_profit: 130,
    p_cantidad: 10,
    p_ratio_riesgo_beneficio: 3,
    p_porcentaje_riesgo: 10,
    p_notas: null,
  });
  opIdDeA = data as string;
});

describe("lectura: B no ve nada de A", () => {
  test("no ve los portafolios de A", async () => {
    const { data } = await B.client.from("portafolios").select("id");
    expect(data?.map((p) => p.id)).not.toContain(A.portafolioId);
  });

  test("no ve las operaciones de A", async () => {
    const { data } = await B.client.from("operaciones").select("id");
    expect(data).toHaveLength(0);
  });

  test("no ve los saldos de A", async () => {
    const { data } = await B.client
      .from("cuentas_saldos")
      .select("id")
      .eq("portafolio_id", A.portafolioId);
    expect(data).toHaveLength(0);
  });

  test("no ve los movimientos de A", async () => {
    const { data } = await B.client
      .from("movimientos_cuenta")
      .select("id")
      .eq("portafolio_id", A.portafolioId);
    expect(data).toHaveLength(0);
  });
});

describe("escritura directa: B no puede tocar datos de A", () => {
  test("no puede insertar una operación en el portafolio de A", async () => {
    const { error } = await B.client.from("operaciones").insert({
      portafolio_id: A.portafolioId,
      activo: "HACK",
      tipo_operacion: "long",
      fecha_entrada: "2026-07-01",
      precio_entrada: 1,
      cantidad: 1,
      ratio_riesgo_beneficio: 1,
      porcentaje_riesgo_cuenta: 1,
    });

    expect(error).not.toBeNull();
  });

  test("no puede renombrar el portafolio de A", async () => {
    await B.client.from("portafolios").update({ nombre: "Robado" }).eq("id", A.portafolioId);

    const { data } = await A.client
      .from("portafolios")
      .select("nombre")
      .eq("id", A.portafolioId)
      .single();
    expect(data?.nombre).toBe("Mi Cuenta Principal");
  });

  test("no puede borrar el portafolio de A", async () => {
    await B.client.from("portafolios").delete().eq("id", A.portafolioId);

    const { data } = await A.client
      .from("portafolios")
      .select("id")
      .eq("id", A.portafolioId);
    expect(data).toHaveLength(1);
  });
});

describe("RPC: B no puede operar sobre el portafolio de A", () => {
  test("set_saldo_inicial sobre el portafolio de A es rechazado", async () => {
    const { error } = await B.client.rpc("set_saldo_inicial", {
      p_portafolio_id: A.portafolioId,
      p_cuenta: "usd",
      p_monto: 999999,
    });

    expect(error?.message).toMatch(/PORTAFOLIO_NO_AUTORIZADO/);
  });

  test("registrar_movimiento_cuenta sobre el portafolio de A es rechazado", async () => {
    const { error } = await B.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: A.portafolioId,
      p_cuenta: "usd",
      p_tipo: "retiro",
      p_monto: 100,
      p_fecha: "2026-07-01",
      p_notas: null,
    });

    expect(error?.message).toMatch(/PORTAFOLIO_NO_AUTORIZADO/);
  });

  test("cerrar_operacion sobre una operación de A es rechazado", async () => {
    const { error } = await B.client.rpc("cerrar_operacion", {
      p_op_id: opIdDeA,
      p_precio_salida: 120,
      p_fecha_salida: "2026-07-10",
      p_cantidad_cerrada: 10,
    });

    expect(error?.message).toMatch(/PORTAFOLIO_NO_AUTORIZADO/);
  });

  test("abrir_plazo_fijo sobre el portafolio de A es rechazado", async () => {
    const { error } = await B.client.rpc("abrir_plazo_fijo", {
      p_portafolio_id: A.portafolioId,
      p_monto: 100,
      p_divisa: "USD",
      p_tasa_tna: 50,
      p_plazo_dias: 30,
      p_fecha_inicio: "2026-07-01",
      p_fecha_vencimiento: "2026-07-31",
      p_interes_estimado: 4,
      p_notas: null,
    });

    expect(error?.message).toMatch(/PORTAFOLIO_NO_AUTORIZADO/);
  });
});

describe("el ledger de movimientos es append-only", () => {
  test("el propio dueño no puede editar un movimiento", async () => {
    const { data: mov } = await A.client
      .from("movimientos_cuenta")
      .select("id, monto")
      .eq("tipo", "apertura")
      .single();

    await A.client
      .from("movimientos_cuenta")
      .update({ monto: 0 })
      .eq("id", mov?.id);

    const { data: despues } = await A.client
      .from("movimientos_cuenta")
      .select("monto")
      .eq("id", mov?.id)
      .single();

    expect(Number(despues?.monto)).toBe(Number(mov?.monto));
  });

  test("el propio dueño no puede borrar un movimiento", async () => {
    const { data: antes } = await A.client
      .from("movimientos_cuenta")
      .select("id")
      .eq("portafolio_id", A.portafolioId);

    await A.client
      .from("movimientos_cuenta")
      .delete()
      .eq("portafolio_id", A.portafolioId);

    const { data: despues } = await A.client
      .from("movimientos_cuenta")
      .select("id")
      .eq("portafolio_id", A.portafolioId);

    expect(despues).toHaveLength(antes?.length ?? 0);
  });
});

describe("nombres de portafolio únicos por usuario", () => {
  test("el mismo usuario no puede repetir un nombre", async () => {
    const { error } = await A.client.from("portafolios").insert({
      nombre: "Mi Cuenta Principal",
      tipo_mercado: "mixto",
      user_id: A.userId,
    });

    expect(error?.code).toBe("23505");
  });

  test("la unicidad ignora mayúsculas y espacios", async () => {
    const { error } = await A.client.from("portafolios").insert({
      nombre: "  mi cuenta principal  ",
      tipo_mercado: "mixto",
      user_id: A.userId,
    });

    expect(error?.code).toBe("23505");
  });

  test("dos usuarios distintos sí pueden tener el mismo nombre", async () => {
    const { data } = await B.client
      .from("portafolios")
      .select("nombre")
      .eq("id", B.portafolioId)
      .single();

    expect(data?.nombre).toBe("Mi Cuenta Principal");
  });
});
```

- [ ] **Step 2: Escribir `tests/sql/invarianteContable.test.ts`**

```typescript
import { describe, expect, test } from "vitest";
import { crearUsuarioDePrueba } from "../setup/usuarios";

/**
 * Invariante del sistema de saldos: para cada cuenta, la suma con signo de sus
 * movimientos tiene que dar exactamente su `disponible`. Cualquier camino futuro
 * que mueva saldo sin registrar movimiento (o al revés) rompe este test, aunque
 * los tests puntuales de cada RPC sigan pasando.
 */
async function verificarInvariante(u: Awaited<ReturnType<typeof crearUsuarioDePrueba>>) {
  const { data: movs } = await u.client
    .from("movimientos_cuenta")
    .select("cuenta, monto")
    .eq("portafolio_id", u.portafolioId);

  const sumaPorCuenta = new Map<string, number>();
  for (const m of movs ?? []) {
    const cuenta = m.cuenta as string;
    sumaPorCuenta.set(cuenta, (sumaPorCuenta.get(cuenta) ?? 0) + Number(m.monto));
  }

  const { data: saldos } = await u.client
    .from("cuentas_saldos")
    .select("cuenta, disponible")
    .eq("portafolio_id", u.portafolioId);

  for (const s of saldos ?? []) {
    const cuenta = s.cuenta as string;
    expect(
      Number(s.disponible),
      `la cuenta ${cuenta} no cuadra con su ledger`
    ).toBeCloseTo(sumaPorCuenta.get(cuenta) ?? 0, 6);
  }

  return saldos?.length ?? 0;
}

describe("invariante contable", () => {
  test("saldo y ledger cuadran tras una secuencia completa", async () => {
    const u = await crearUsuarioDePrueba();

    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usd",
      p_monto: 10000,
    });
    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_monto: 200000,
    });

    await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usd",
      p_tipo: "deposito",
      p_monto: 2000,
      p_fecha: "2026-07-02",
      p_notas: "Aporte",
    });

    const { data: opId } = await u.client.rpc("abrir_operacion", {
      p_portafolio_id: u.portafolioId,
      p_activo: "AAPL",
      p_tipo_activo: "acciones",
      p_sub_tipo_activo: "usd",
      p_divisa: "USD",
      p_apalancamiento: null,
      p_tipo_operacion: "long",
      p_fecha_entrada: "2026-07-03",
      p_precio_entrada: 100,
      p_precio_stop_loss: 90,
      p_precio_take_profit: 130,
      p_cantidad: 20,
      p_ratio_riesgo_beneficio: 3,
      p_porcentaje_riesgo: 10,
      p_notas: null,
    });

    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 115,
      p_fecha_salida: "2026-07-05",
      p_cantidad_cerrada: 8,
    });
    await u.client.rpc("cerrar_operacion", {
      p_op_id: opId,
      p_precio_salida: 95,
      p_fecha_salida: "2026-07-06",
      p_cantidad_cerrada: 12,
    });

    const { data: plazoId } = await u.client.rpc("abrir_plazo_fijo", {
      p_portafolio_id: u.portafolioId,
      p_monto: 100000,
      p_divisa: "ARS",
      p_tasa_tna: 73,
      p_plazo_dias: 30,
      p_fecha_inicio: "2026-07-01",
      p_fecha_vencimiento: "2026-07-31",
      p_interes_estimado: 6000,
      p_notas: null,
    });
    await u.client.rpc("liquidar_plazo_fijo", { p_id: plazoId });

    await u.client.rpc("registrar_movimiento_cuenta", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "ars",
      p_tipo: "retiro",
      p_monto: 50000,
      p_fecha: "2026-07-07",
      p_notas: null,
    });

    const cuentasVerificadas = await verificarInvariante(u);
    expect(cuentasVerificadas).toBe(2);
  });

  test("una operación fallida por fondos no desbalancea nada", async () => {
    const u = await crearUsuarioDePrueba();

    await u.client.rpc("set_saldo_inicial", {
      p_portafolio_id: u.portafolioId,
      p_cuenta: "usd",
      p_monto: 100,
    });

    await u.client.rpc("abrir_operacion", {
      p_portafolio_id: u.portafolioId,
      p_activo: "AAPL",
      p_tipo_activo: "acciones",
      p_sub_tipo_activo: "usd",
      p_divisa: "USD",
      p_apalancamiento: null,
      p_tipo_operacion: "long",
      p_fecha_entrada: "2026-07-03",
      p_precio_entrada: 100,
      p_precio_stop_loss: 90,
      p_precio_take_profit: 130,
      p_cantidad: 50,
      p_ratio_riesgo_beneficio: 3,
      p_porcentaje_riesgo: 10,
      p_notas: null,
    });

    await verificarInvariante(u);
  });
});
```

- [ ] **Step 3: Correr los dos**

Run: `npm run test:sql`
Expected: PASS. Si algún test de RLS falla, **no seguir**: es un agujero de
aislamiento P0 y hay que reportarlo antes de continuar.

- [ ] **Step 4: Commit**

```bash
git add tests/sql/rls.test.ts tests/sql/invarianteContable.test.ts
git commit -m "test(sql): cubrir RLS, ledger append-only e invariante contable"
```

---

### Task 14: Tests de componentes

**Files:**
- Create: `tests/setup/jsdom.setup.ts`
- Create: `tests/componentes/useListaPaginada.test.tsx`
- Create: `tests/componentes/RiskPanel.test.tsx`
- Create: `tests/componentes/CryptoForm.test.tsx`
- Create: `tests/unit/formValidation.test.ts`
- Modify: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `useListaPaginada(items, opciones)` de `@/components/ListaPaginada`;
  `unirFaltantes(items)` y `mensajeCamposFaltantes(items)` de
  `@/components/forms/formValidation`.
- Produces: el proyecto `componentes` de Vitest y el script `test:componentes`.

- [ ] **Step 1: Instalar las dependencias de componentes**

```bash
npm install -D @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Crear `tests/setup/jsdom.setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 3: Agregar el proyecto `componentes` a `vitest.config.ts`**

Importar el plugin al principio del archivo:

```typescript
import react from "@vitejs/plugin-react";
```

Y agregar este proyecto al array `projects`:

```typescript
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "componentes",
          include: ["tests/componentes/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["tests/setup/jsdom.setup.ts"],
        },
      },
```

Agregar a `package.json`:

```json
"test:componentes": "vitest run --project componentes"
```

Y cambiar el script `test` para que corra unitarios y componentes juntos (los dos
sin Docker):

```json
"test": "vitest run --project unit --project componentes"
```

- [ ] **Step 4: Escribir `tests/componentes/useListaPaginada.test.tsx`**

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useListaPaginada } from "@/components/ListaPaginada";

const items = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("useListaPaginada con conMinimizar (historiales)", () => {
  test("con 40 ítems arranca colapsado en 5, sin paginador", () => {
    const { result } = renderHook(() =>
      useListaPaginada(items(40), { conMinimizar: true })
    );

    expect(result.current.visibles).toHaveLength(5);
    expect(result.current.mostrarVerMas).toBe(true);
    expect(result.current.mostrarPaginador).toBe(false);
    expect(result.current.mostrarMinimizar).toBe(false);
    expect(result.current.totalCount).toBe(40);
  });

  test("al maximizar pagina de a 10 y ofrece minimizar", () => {
    const { result } = renderHook(() =>
      useListaPaginada(items(40), { conMinimizar: true })
    );

    act(() => result.current.verMas());

    expect(result.current.visibles).toHaveLength(10);
    expect(result.current.mostrarPaginador).toBe(true);
    expect(result.current.mostrarMinimizar).toBe(true);
    expect(result.current.totalPaginas).toBe(4);
  });

  test("navegar a la página 3 muestra el bloque correcto", () => {
    const { result } = renderHook(() =>
      useListaPaginada(items(40), { conMinimizar: true })
    );

    act(() => result.current.verMas());
    act(() => result.current.irAPagina(3));

    expect(result.current.pagina).toBe(3);
    expect(result.current.visibles[0]).toBe(21);
    expect(result.current.visibles.at(-1)).toBe(30);
  });

  test("minimizar vuelve a 5 ítems y resetea a la página 1", () => {
    const { result } = renderHook(() =>
      useListaPaginada(items(40), { conMinimizar: true })
    );

    act(() => result.current.verMas());
    act(() => result.current.irAPagina(3));
    act(() => result.current.colapsar());

    expect(result.current.visibles).toHaveLength(5);
    expect(result.current.pagina).toBe(1);
    expect(result.current.mostrarVerMas).toBe(true);
  });

  test.each([
    [5, 5, false],
    [6, 5, true],
    [10, 5, true],
    [11, 5, true],
  ])(
    "con %d ítems muestra %d y verMas=%s en el estado inicial",
    (total, visibles, verMas) => {
      const { result } = renderHook(() =>
        useListaPaginada(items(total), { conMinimizar: true })
      );

      expect(result.current.visibles).toHaveLength(visibles);
      expect(result.current.mostrarVerMas).toBe(verMas);
    }
  );

  test("con 6 ítems, maximizar los muestra todos y ofrece minimizar", () => {
    const { result } = renderHook(() =>
      useListaPaginada(items(6), { conMinimizar: true })
    );

    act(() => result.current.verMas());

    expect(result.current.visibles).toHaveLength(6);
    expect(result.current.mostrarPaginador).toBe(false);
    expect(result.current.mostrarMinimizar).toBe(true);
  });

  test("con 11 ítems, maximizar activa el paginador de 2 páginas", () => {
    const { result } = renderHook(() =>
      useListaPaginada(items(11), { conMinimizar: true })
    );

    act(() => result.current.verMas());

    expect(result.current.totalPaginas).toBe(2);
    expect(result.current.visibles).toHaveLength(10);
  });
});

describe("useListaPaginada sin conMinimizar (modo simple)", () => {
  test("con 5 ítems no muestra ningún control", () => {
    const { result } = renderHook(() => useListaPaginada(items(5)));

    expect(result.current.visibles).toHaveLength(5);
    expect(result.current.mostrarVerMas).toBe(false);
    expect(result.current.mostrarPaginador).toBe(false);
    expect(result.current.mostrarMinimizar).toBe(false);
  });

  test("con 8 ítems colapsa en 5 y ofrece maximizar sin minimizar", () => {
    const { result } = renderHook(() => useListaPaginada(items(8)));

    expect(result.current.mostrarVerMas).toBe(true);

    act(() => result.current.verMas());

    expect(result.current.visibles).toHaveLength(8);
    expect(result.current.mostrarMinimizar).toBe(false);
  });

  test("con 25 ítems pagina directo, sin pasar por el colapsado", () => {
    const { result } = renderHook(() => useListaPaginada(items(25)));

    expect(result.current.mostrarPaginador).toBe(true);
    expect(result.current.visibles).toHaveLength(10);
    expect(result.current.mostrarMinimizar).toBe(false);
  });
});
```

- [ ] **Step 5: Leer las props reales de `RiskPanel` antes de escribir su test**

Run: `head -60 src/components/RiskPanel.tsx`
Motivo: el test necesita las props exactas. Si el componente lee de un contexto
en vez de recibir props, envolverlo en el provider correspondiente o —si eso lo
vuelve un test de integración disfrazado— reemplazar este archivo por un test de
la función `rrNivel` exportada del mismo módulo, y anotarlo en el PR.

- [ ] **Step 6: Escribir `tests/componentes/RiskPanel.test.tsx`**

Ajustar el nombre de las props al resultado del paso anterior; la estructura del
test no cambia:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import RiskPanel from "@/components/RiskPanel";

describe("RiskPanel", () => {
  test("con Stop Loss y Take Profit muestra el ratio R:R", () => {
    render(
      <RiskPanel
        precioEntrada={100}
        precioStopLoss={90}
        precioTakeProfit={130}
        cantidad={10}
        tipoOperacion="long"
        claseActivo="acciones"
      />
    );

    expect(screen.getByText(/3(\.|,)00|3:1|R:R/i)).toBeInTheDocument();
  });

  test("sin Stop Loss oculta la pérdida máxima y pide cargarlo", () => {
    render(
      <RiskPanel
        precioEntrada={100}
        precioTakeProfit={130}
        cantidad={10}
        tipoOperacion="long"
        claseActivo="acciones"
      />
    );

    expect(screen.getByText(/Stop Loss/i)).toBeInTheDocument();
  });

  test("sin Stop Loss ni Take Profit igual muestra el valor de la posición", () => {
    render(
      <RiskPanel
        precioEntrada={100}
        cantidad={10}
        tipoOperacion="long"
        claseActivo="acciones"
      />
    );

    expect(screen.getByText(/1\.?000/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Escribir `tests/unit/formValidation.test.ts`**

Módulo puro, va con los unitarios aunque se escriba en esta tarea. Fija el copy
en registro formal ("Complete...") que exige la convención del proyecto.

```typescript
import { describe, expect, test } from "vitest";
import { mensajeCamposFaltantes, unirFaltantes } from "@/components/forms/formValidation";

describe("unirFaltantes", () => {
  test("una lista vacía da cadena vacía", () => {
    expect(unirFaltantes([])).toBe("");
  });

  test("un solo item va sin conectores", () => {
    expect(unirFaltantes(["el activo"])).toBe("el activo");
  });

  test("dos items se unen con 'y'", () => {
    expect(unirFaltantes(["el activo", "la cantidad"])).toBe("el activo y la cantidad");
  });

  test("tres o más usan comas y una 'y' final", () => {
    expect(unirFaltantes(["el activo", "la cantidad", "el precio"])).toBe(
      "el activo, la cantidad y el precio"
    );
  });
});

describe("mensajeCamposFaltantes", () => {
  test("usa el registro formal (usted) y cierra con punto", () => {
    expect(mensajeCamposFaltantes(["el activo"])).toBe(
      "Complete los siguientes campos obligatorios: el activo."
    );
  });
});
```

- [ ] **Step 8: Inspeccionar de qué contextos depende el formulario de cripto**

```bash
head -40 src/components/forms/CryptoForm.tsx
```

Motivo: `CryptoForm` casi seguro consume `PortafoliosContext` y `CuentasContext`.
Anotar qué providers hace falta envolver y qué valor mínimo espera cada uno; el
test del paso siguiente los necesita. Si el componente además dispara llamadas a
Supabase al montarse, mockear `@/lib/tradesApi` con `vi.mock` en vez de dejarlo
salir a la red.

- [x] **Step 9: Escribir `tests/componentes/CryptoForm.test.tsx`** —
      **DESCARTADO el 2026-07-29, movido a la tarea 15 (E2E).**

Se aplicó la condición de corte del paso 10 de esta misma tarea. Inspeccionado
`CryptoForm`, depende de **cuatro** contextos —`TradesContext`, `CuentasContext`,
portafolios vía `usePortafolioDestino`, y preferencias vía el `RiskPanel` que
embebe— y monta un `AssetAutocomplete` que **sale a la red al renderizarse**.

Montarlo exigiría cuatro providers más un mock de red: en los hechos sería un
test de integración de media app disfrazado de test de componente, frágil ante
cualquier cambio de contexto y lento. Las tres aserciones que interesan
(direccionalidad Long/Short según Spot o Futuros, el `max` de la fecha de
entrada, y el mensaje de campos obligatorios) **se cubren mejor end-to-end**, con
el formulario real y sus datos reales.

Lo que sí quedó cubierto de este paso: `mensajeCamposFaltantes` y
`unirFaltantes` tienen sus tests unitarios en `tests/unit/formValidation.test.ts`
—el copy en registro formal está fijado ahí—, y `RiskPanel`, que es el pedazo de
este formulario con lógica de presentación propia, tiene los suyos.

*Test descartado, conservado para trazabilidad:*

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import CryptoForm from "@/components/forms/CryptoForm";

// Reemplazar por los providers reales que surjan del paso 8.
function renderForm() {
  return render(<CryptoForm />);
}

describe("CryptoForm — direccionalidad por mercado", () => {
  test("en Futuros ofrece elegir Long o Short", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: /futuros/i }));

    expect(screen.getByRole("button", { name: /^long$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^short$/i })).toBeInTheDocument();
  });

  test("en Spot no ofrece Short: spot solo opera Long", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: /spot/i }));

    expect(screen.queryByRole("button", { name: /^short$/i })).not.toBeInTheDocument();
  });
});

describe("CryptoForm — validaciones de carga", () => {
  test("la fecha de entrada no permite elegir un día futuro", () => {
    renderForm();

    const hoy = new Date().toISOString().slice(0, 10);
    const fecha = screen.getByLabelText(/fecha de entrada/i);
    expect(fecha).toHaveAttribute("max", hoy);
  });

  test("un Stop Loss del lado incorrecto para un Long muestra el error", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: /futuros/i }));
    await userEvent.click(screen.getByRole("button", { name: /^long$/i }));

    await userEvent.type(screen.getByLabelText(/precio de entrada/i), "100");
    await userEvent.type(screen.getByLabelText(/stop loss/i), "110");

    expect(
      await screen.findByText(/Stop Loss debe ser menor al precio de entrada/i)
    ).toBeInTheDocument();
  });

  test("enviar sin campos obligatorios pide completarlos en registro formal", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: /guardar|registrar/i }));

    expect(
      await screen.findByText(/Complete los siguientes campos obligatorios/i)
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Correr los tests de componentes**

Run: `npm run test:componentes && npm test -- formValidation`
Expected: PASS. Si `RiskPanel` no acepta las props del paso 5, aplicar su plan B.
Si `CryptoForm` resulta imposible de montar sin arrastrar media app (más de dos
providers o llamadas a red al montar), **detenerse y consultar**: en ese caso el
test correcto es E2E, no de componente, y hay que moverlo a la tarea 15 en vez de
forzar un montaje frágil.

- [ ] **Step 11: Commit**

```bash
git add tests/setup/jsdom.setup.ts tests/componentes tests/unit/formValidation.test.ts vitest.config.ts package.json package-lock.json
git commit -m "test: cubrir useListaPaginada, RiskPanel y el formulario de cripto"
```

---

### Task 15: E2E con Playwright

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/flujos.spec.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: la app corriendo en `http://127.0.0.1:3100` contra Supabase local.
- Produces: el script `test:e2e`.

- [ ] **Step 1: Instalar Playwright**

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Crear `playwright.config.ts`**

```typescript
import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";

const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" })
) as Record<string, string>;

// Puerto 3100 a propósito: el 3000 lo usa el dueño del repo para su `npm run dev`
// y Next bloquea una segunda instancia por el lock de `.next/`.
const BASE_URL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run start -- --port 3100",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    },
  },
});
```

- [ ] **Step 3: Ignorar los artefactos de Playwright**

Agregar a `.gitignore`:

```
# Playwright
/test-results
/playwright-report
/blob-report
/playwright/.cache
```

- [ ] **Step 4: Agregar el script**

```json
"test:e2e": "playwright test"
```

- [ ] **Step 5: Escribir los 5 flujos**

Crear `tests/e2e/flujos.spec.ts`. Los selectores por texto se ajustan en el paso
siguiente contra la app real; la estructura y las aserciones son las definitivas.

```typescript
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const PASSWORD = "Prueba1234!";

async function registrarse(page: Page): Promise<string> {
  const email = `e2e-${randomUUID()}@ejemplo.test`;
  await page.goto("/signup");
  await page.getByLabel(/correo|email/i).fill(email);
  await page.getByLabel(/contraseña/i).first().fill(PASSWORD);
  await page.getByRole("button", { name: /crear cuenta|registrar/i }).click();
  await expect(page).toHaveURL(/\/(cuenta|dashboard)/, { timeout: 30000 });
  return email;
}

test("1. registro, login y aterrizaje en la app", async ({ page }) => {
  await registrarse(page);
  await expect(page.getByText(/Mi Cuenta Principal/i)).toBeVisible();
});

test("2. cargar saldo y abrir una operación descuenta el costo exacto", async ({ page }) => {
  await registrarse(page);

  await page.goto("/cuenta");
  await page.getByRole("button", { name: /cargar saldo|saldo inicial/i }).first().click();
  await page.getByRole("spinbutton").first().fill("10000");
  await page.getByRole("button", { name: /guardar|confirmar/i }).click();
  await expect(page.getByText(/10\.?000/)).toBeVisible();

  await page.goto("/nueva-operacion");
  await page.getByLabel(/activo|símbolo/i).fill("AAPL");
  await page.getByLabel(/precio de entrada/i).fill("100");
  await page.getByLabel(/cantidad/i).fill("10");
  await page.getByRole("button", { name: /guardar|registrar/i }).click();

  await page.goto("/cuenta");
  // 10000 - (10 x 100) = 9000 disponible.
  await expect(page.getByText(/9\.?000/)).toBeVisible();
  await expect(page.getByText(/apertura/i)).toBeVisible();
});

test("3. cierre parcial acredita solo la porción y deja la posición abierta", async ({ page }) => {
  await registrarse(page);
  // Precondición: repetir el flujo del test 2 (saldo 10000 + operación de 10 x 100).
  await page.goto("/cuenta");
  await page.getByRole("button", { name: /cargar saldo|saldo inicial/i }).first().click();
  await page.getByRole("spinbutton").first().fill("10000");
  await page.getByRole("button", { name: /guardar|confirmar/i }).click();

  await page.goto("/nueva-operacion");
  await page.getByLabel(/activo|símbolo/i).fill("AAPL");
  await page.getByLabel(/precio de entrada/i).fill("100");
  await page.getByLabel(/cantidad/i).fill("10");
  await page.getByRole("button", { name: /guardar|registrar/i }).click();

  await page.goto("/posiciones-abiertas");
  await page.getByRole("button", { name: /cerrar/i }).first().click();
  await page.getByLabel(/precio de salida/i).fill("120");
  await page.getByLabel(/cantidad a cerrar|cantidad/i).fill("4");
  await page.getByRole("button", { name: /confirmar|cerrar/i }).last().click();

  // La posición sigue abierta con 6 unidades.
  await expect(page.getByText(/AAPL/)).toBeVisible();
  await page.goto("/cuenta");
  // 9000 + (400 costo + 80 pnl) = 9480.
  await expect(page.getByText(/9\.?480/)).toBeVisible();
});

test("4. abrir sin fondos muestra el aviso y no escribe nada", async ({ page }) => {
  await registrarse(page);

  await page.goto("/nueva-operacion");
  await page.getByLabel(/activo|símbolo/i).fill("AAPL");
  await page.getByLabel(/precio de entrada/i).fill("100");
  await page.getByLabel(/cantidad/i).fill("10");
  await page.getByRole("button", { name: /guardar|registrar/i }).click();

  await expect(page.getByText(/fondos insuficientes|no tiene fondos/i)).toBeVisible();

  await page.goto("/posiciones-abiertas");
  await expect(page.getByText(/AAPL/)).toHaveCount(0);
});

test("5. el importador marca los duplicados en el preview", async ({ page }) => {
  await registrarse(page);

  await page.goto("/historial");
  await page.getByRole("tab", { name: /exportar\/importar/i }).click();

  // Archivo del formato propio con la misma operación repetida dos veces.
  const csv = [
    "activo,tipoActivo,subTipoActivo,divisa,tipoOperacion,fechaEntrada,precioEntrada,cantidad,estado,fechaSalida,precioSalida",
    "AAPL,acciones,usd,USD,long,2026-07-01,100,10,cerrada,2026-07-05,120",
    "AAPL,acciones,usd,USD,long,2026-07-01,100,10,cerrada,2026-07-05,120",
  ].join("\n");

  await page.setInputFiles('input[type="file"]', {
    name: "propio.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });

  await expect(page.getByText(/duplicad/i)).toBeVisible({ timeout: 20000 });
  // La fila duplicada arranca destildada.
  const checkboxes = page.getByRole("checkbox");
  await expect(checkboxes.nth(1)).not.toBeChecked();
});
```

- [ ] **Step 6: Ajustar los selectores contra la app real**

```bash
npm run test:e2e -- --headed
```

Los selectores por texto de arriba son la mejor aproximación desde el código; el
copy exacto de labels y botones hay que confirmarlo en pantalla. Corregir cada
selector que no matchee hasta que los 5 flujos pasen. **No cambiar las
aserciones de importes** — esos números salen de las fórmulas y si no dan, es un
defecto, no un selector.

- [ ] **Step 7: Correr la suite E2E completa**

Run: `npm run test:e2e`
Expected: 5 passed.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts tests/e2e package.json package-lock.json .gitignore
git commit -m "test(e2e): cubrir los 5 flujos críticos con Playwright"
```

---

### Task 16: CI — job completo y documentación del alcance

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Create: `docs/testing.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: los scripts `test`, `test:sql`, `test:e2e`, `db:reset`.

- [ ] **Step 1: Agregar el job `completo` a `.github/workflows/ci.yml`**

Debajo del job `rapido`, con la misma indentación:

```yaml
  completo:
    name: Integración SQL y E2E
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Instalar dependencias
        run: npm ci

      - name: Instalar la CLI de Supabase
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Levantar Supabase local
        run: supabase start

      - name: Aplicar migraciones
        run: node scripts/aplicar-migraciones.mjs

      - name: Tests de integración SQL
        run: npm run test:sql

      - name: Instalar navegadores de Playwright
        run: npx playwright install --with-deps chromium

      - name: Tests E2E
        run: npm run test:e2e

      - name: Subir el reporte de Playwright
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Escribir `docs/testing.md`**

```markdown
# Suite de pruebas

Diseño completo y criterio de priorización:
[`docs/superpowers/specs/2026-07-29-suite-de-pruebas-design.md`](superpowers/specs/2026-07-29-suite-de-pruebas-design.md).

## Cómo correrla

| Comando | Qué corre | Necesita Docker |
|---|---|---|
| `npm test` | Unitarios y componentes | No |
| `npm run test:sql` | Integración contra las RPC y RLS | Sí |
| `npm run test:e2e` | Los 5 flujos de Playwright | Sí |
| `npm run db:reset` | Recrea la base local desde las migraciones | Sí |

Para los dos últimos hace falta `supabase start` corriendo (Docker Desktop +
WSL2 + Supabase CLI).

## Cómo está organizada

- `tests/unit/` — lógica pura: fórmulas de riesgo, cuentas, importador.
- `tests/sql/` — las 6 RPC de saldos, RLS y el invariante contable.
- `tests/componentes/` — `useListaPaginada` y `RiskPanel`.
- `tests/e2e/` — flujos completos en navegador.
- `tests/setup/` — todo lo que habla con Supabase local.

Cada test SQL crea su propio usuario: el aislamiento lo da RLS, no un truncate
entre tests, así que pueden correr en paralelo.

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
```

- [ ] **Step 3: Agregar el puntero en `CLAUDE.md`**

En la sección "Cómo levantar el proyecto", después del bloque de `npm run dev`:

```markdown
## Cómo correr las pruebas

```
npm test
```

Corre unitarios y componentes (no necesita Docker). La integración SQL y los E2E
necesitan Supabase local — ver [`docs/testing.md`](docs/testing.md).
```

- [ ] **Step 4: Correr la suite completa localmente antes de abrir el PR**

```bash
npm run typecheck && npm test && npm run test:sql && npm run test:e2e
```

Expected: todo verde, con los cinco `test.fails` fallando como corresponde.

- [ ] **Step 5: Commit y abrir el PR**

```bash
git add .github/workflows/ci.yml docs/testing.md CLAUDE.md package.json
git commit -m "ci: agregar job completo con SQL y E2E, y documentar la suite"
git push
gh pr create --title "test: suite de pruebas automatizada" --body "$(cat <<'EOF'
## Qué trae

Suite de pruebas desde cero, priorizada por consecuencia de la falla:
unitarios (fórmulas de riesgo, cuentas, importador), integración SQL contra las
6 RPC de saldos y RLS, componentes, y 5 flujos E2E. Todo corriendo en CI.

Diseño y criterio: `docs/superpowers/specs/2026-07-29-suite-de-pruebas-design.md`.

## Defectos encontrados escribiendo los tests

Nueve, tres de ellos P0 (creación de dinero vía RPC). Están documentados en la
sección 9 del spec y cubiertos por tests en `test.fails`. **Los arreglos van en
PRs aparte**, para que este PR sea solo la suite.

## Cómo verificar

```
npm test
npm run test:sql   # necesita `supabase start`
npm run test:e2e   # necesita `supabase start`
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Verificar que los dos jobs de CI pasan**

```bash
gh pr checks --watch
```

Expected: `rapido` y `completo` en verde.

---

## Después de este plan

Los arreglos de los nueve defectos NO están en este plan, a propósito: el PR de
la suite tiene que ser legible por sí solo. El orden sugerido para los PRs
siguientes, por severidad:

1. **PR de validación de parámetros en las RPC** — defectos 9.1, 9.5 (los **dos**
   P0; 9.2 bajó a P3 al medirlo, ver la revisión del 2026-07-29 en la sección 9
   del spec) y de paso 9.2. Nueva migración `015_validar_parametros_rpc.sql`
   con un bloque de guardas al inicio de `abrir_operacion`, `abrir_plazo_fijo` y
   `cerrar_operacion`. Convierte tres `test.fails` en `test`.

   **Agregar también `check` de columna en `operaciones`** (`cantidad > 0`,
   `precio_entrada > 0`, `precio_salida > 0` cuando no es null), replicando lo
   que `plazos_fijos` ya tiene. Esa restricción es exactamente la que evitó que
   9.2 fuera un P0; su ausencia en `operaciones` es lo que hace que 9.1 sí lo
   sea. La guarda en la función protege de la llamada directa a la RPC; el
   `check` protege de cualquier vía de escritura, incluidas las que todavía no
   existen.

   **Ojo con el orden:** si se agrega el `check` a una tabla que ya tiene datos
   inválidos, el `ALTER TABLE` falla. Verificar antes con un `select` de filas
   con `cantidad <= 0` o `precio_entrada <= 0` en la base real.
2. **PR de fechas** — defecto 9.4 (cierre anterior a la apertura, misma
   migración o una siguiente) y 9.3 (huso horario en `plazoFijoVencido`).
3. **PR del importador** — defectos 9.6 (regla de miles por locale) y 9.7
   (validación de calendario en `parseFecha`).
4. **PR de coherencia de fórmulas** — defectos 9.8 y 9.9 en `riskCalculations`.
5. **PR de permisos explícitos de tabla** — defecto 9.10. Migración
   `016_grants_explicitos.sql` con `grant select, insert, update, delete` por
   tabla a `authenticated` (y lo que corresponda a `anon` y `service_role`), para
   que el esquema deje de depender de los permisos por defecto del entorno.

   **Cuidado con la numeración:** el `015` ya queda reservado por el PR 1 de esta
   lista. Si ese PR se mergea después, renumerar antes de correr nada — dos
   archivos `015_` distintos rompen el orden del script de migraciones y, peor,
   el flujo manual del SQL Editor.

   **Cómo verificarlo cuando se haga:** el harness deja de necesitar
   `supabase_admin`. Es decir, volver `USUARIO_DB` a `postgres` en
   `scripts/aplicar-migraciones.mjs`, correr `npm run db:reset` y `npm run
   test:sql`: si el esquema se volvió autosuficiente, sigue en verde. Ese es el
   criterio de aceptación del PR, y es exactamente el escenario que hoy falla.
