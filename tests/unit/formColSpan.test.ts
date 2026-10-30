import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * OPS-BUG-01, causa real. Los PRs #51 y #52 dejaron los dos grids de los
 * formularios en UNA columna (ver `tests/unit/formStyles.test.ts`), pero el
 * formulario se seguia viendo mal en el Xiaomi. El motivo son los `col-span-2`
 * que quedaron en los campos, herencia de cuando el grid tenia 2 columnas.
 *
 * Un `col-span-2` dentro de un `grid-cols-1` NO es inofensivo: la celda pide
 * dos tracks, el grid solo declara uno, y el navegador CREA UNA SEGUNDA COLUMNA
 * IMPLICITA dimensionada con `grid-auto-columns: auto`. Medido en Chrome, con
 * un contenedor de 344px utiles:
 *
 *   sin col-span-2  ->  grid-template-columns: 344px        primer campo 344px
 *   con col-span-2  ->  grid-template-columns: 157px 177px  primer campo 157px
 *
 * O sea: el grid dice "una columna" y el navegador hace dos, aplastando la
 * primera. Ese es exactamente el sintoma reportado desde el principio ("primera
 * columna aplastada", campos apretados), y explica por que fallaron los cinco
 * intentos previos: todos buscaban un error de MEDICION DE ANCHO (media query,
 * container query, ResizeObserver, minimo entre contenedor y ventana) y no
 * habia ninguno. Esto no depende del ancho ni del dispositivo: pasa siempre.
 *
 * Por que el test lee el fuente en vez de renderizar: jsdom no calcula layout,
 * asi que no puede observar el track implicito. Y renderizar los formularios
 * completos exige los contextos de Supabase. Lo que se puede fijar sin eso es
 * la regla que importa: mientras el grid sea de una columna, `col-span` no
 * puede aparecer en estos archivos. Mismo criterio que `formStyles.test.ts`.
 */
const ARCHIVOS = [
  "src/components/forms/AccionesForm.tsx",
  "src/components/forms/CryptoForm.tsx",
  "src/components/forms/PlazoFijoForm.tsx",
  "src/components/forms/usePortafolioDestino.tsx",
];

describe("los formularios de alta no usan col-span", () => {
  test.each(ARCHIVOS)("%s no declara ninguna clase col-span", (ruta) => {
    const fuente = readFileSync(join(process.cwd(), ruta), "utf8");
    const encontrados = fuente.match(/\bcol-span-\S*/g) ?? [];
    expect(encontrados).toEqual([]);
  });
});
