# Lógica Financiera de Referencia

Este documento es el "source of truth" de las fórmulas de gestión de riesgo. La implementación en código vive en [`src/utils/riskCalculations.ts`](../src/utils/riskCalculations.ts) y las interfaces en [`src/types/trading.ts`](../src/types/trading.ts). Cualquier cambio en las fórmulas debe reflejarse en ambos lugares.

El riesgo de una operación **no** se mide como % del balance total de la
cuenta (eso vive a nivel Portafolio, fuera de este documento). Se mide como
% del capital que el usuario decide invertir en esa operación puntual —
nunca hay que pedirle un balance de cuenta para cargar una operación.

## Modos de tamaño de posición

Hay dos formas de determinar `TamañoPosicion`, según el tipo de activo. En
los dos casos el usuario elige directamente cuánto invertir; no hay un
modo que derive el tamaño a partir de un % de riesgo sobre un balance.

**Cantidad fija (acciones, CEDEARs)** — el usuario tipea la cantidad de
unidades directamente:
```
TamañoPosicion = Cantidad
```

**Apalancado (crypto, futuros y spot)** — el usuario tipea el monto
invertido (margen) y, si es futuros, el apalancamiento. En spot el
apalancamiento es siempre 1 (no se puede apalancar comprando directo):
```
TamañoPosicion = (Monto × Apalancamiento) / PrecioEntrada
```

## Fórmulas comunes (ambos modos)

**Stop Loss y Take Profit son opcionales.** El único dato obligatorio para
calcular tamaño y valor de posición es `PrecioEntrada`. Todo lo que sigue
solo se calcula si el dato del que depende está presente:

**Valor total de la posición (= capital invertido en Spot, = valor
nocional en Futuros) — siempre se calcula:**
```
ValorPosicion = TamañoPosicion × PrecioEntrada
```

**Validación direccional de Stop Loss y Take Profit.** El Stop Loss y el
Take Profit deben quedar del lado correcto del precio de entrada según la
dirección de la operación (`TipoOperacion`: `long` o `short`). Si no
cumplen, se rechaza la carga con un error explicando qué corregir — no se
llega a calcular ningún valor con ellos:

| | Stop Loss debe ser | Take Profit debe ser |
|---|---|---|
| Long | `< PrecioEntrada` | `> PrecioEntrada` |
| Short | `> PrecioEntrada` | `< PrecioEntrada` |

Esto evita el caso ambiguo de un "Stop Loss" que en realidad protegería
ganancia (ej. Long con SL arriba de la entrada) — ese valor no es un Stop
Loss válido para esa dirección, se le pide al usuario corregirlo.

**Riesgo por unidad — solo si hay Stop Loss (ya validado):**
```
Long:  RiesgoPorUnidad = PrecioEntrada − PrecioStopLoss
Short: RiesgoPorUnidad = PrecioStopLoss − PrecioEntrada
```

**Recompensa por unidad — solo si hay Take Profit (ya validado):**
```
Long:  RecompensaPorUnidad = PrecioTakeProfit − PrecioEntrada
Short: RecompensaPorUnidad = PrecioEntrada − PrecioTakeProfit
```

Con la validación de arriba, ambas fórmulas dan siempre un valor positivo
(no hace falta `Math.abs`). En Futuros, `TamañoPosicion` ya incluye el
apalancamiento (`(Monto × Apalancamiento) / PrecioEntrada`), así que
`RiesgoPorUnidad × TamañoPosicion` ya equivale a
`(PrecioSL − PrecioEntrada) × Cantidad × Apalancamiento` — no hace falta
una fórmula aparte para Futuros.

**Ratio Riesgo/Beneficio (R:R) — solo si hay Stop Loss Y Take Profit:**
```
Ratio R:R = RecompensaPorUnidad / RiesgoPorUnidad
```

**Pérdida máxima proyectada — solo si hay Stop Loss:**
```
PerdidaMaxima($) = TamañoPosicion × RiesgoPorUnidad
PerdidaMaxima(%) = (PerdidaMaxima($) / ValorPosicion) × 100
```
`PerdidaMaxima(%)` es, en la práctica, qué tan lejos está el stop loss del
precio de entrada expresado como % del precio — no depende de ningún
balance externo a la operación.

**Ganancia máxima proyectada — solo si hay Take Profit:**
```
GananciaMaxima($) = TamañoPosicion × RecompensaPorUnidad
GananciaMaxima(%) = (GananciaMaxima($) / ValorPosicion) × 100
```

Si al usuario no le interesa cargar Stop Loss y/o Take Profit para una
operación, `RiskPanel.tsx` igual muestra tamaño/valor de posición y solo
oculta (con un texto tipo "Cargá el Stop Loss para verla") las métricas
que no se pueden calcular sin ese dato.

## Caso borde: división por cero

Si `PrecioEntrada === PrecioStopLoss` (con Stop Loss cargado),
`RiesgoPorUnidad` sería 0 y el tamaño de posición sería infinito. La
implementación lanza un error controlado en ese caso en vez de devolver
`Infinity` o `NaN`. Si directamente no hay Stop Loss cargado, no hay
comparación ni error — esa rama del cálculo simplemente no corre.

## Interfaces TypeScript

```typescript
interface TradeInputsCantidadFija {
  precioEntrada: number;
  precioStopLoss?: number;
  precioTakeProfit?: number;
  cantidad: number;
  tipoOperacion: "long" | "short";
}

interface TradeInputsApalancado {
  precioEntrada: number;
  precioStopLoss?: number;
  precioTakeProfit?: number;
  monto: number;
  apalancamiento: number;
  tipoOperacion: "long" | "short";
}

interface RiskAnalysis {
  tamañoPosicion: number;
  valorPosicion: number;
  riesgoPorUnidad?: number;
  riesgoMonetario?: number;
  ratioRiesgoBeneficio?: number;
  perdidaMaximaMonetaria?: number;
  perdidaMaximaPorcentaje?: number;
  gananciaMaximaMonetaria?: number;
  gananciaMaximaPorcentaje?: number;
}
```

Ver la implementación ejecutable y comentada en `src/types/trading.ts` y `src/utils/riskCalculations.ts`.
