export function unirFaltantes(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

export function mensajeCamposFaltantes(items: string[]): string {
  return `Complete los siguientes campos obligatorios: ${unirFaltantes(items)}.`;
}

/**
 * Precio opcional (Stop Loss / Take Profit) tal como lo entiende el cálculo de
 * riesgo: `undefined` significa "el usuario no cargó nada".
 *
 * El campo vacío llega como `NaN` desde `parseFloat`, y eso es lo único que hay
 * que traducir. Antes se usaba `precio || undefined`, que además convertía el
 * **cero** en "sin cargar": un Stop Loss de 0 —raro, pero posible en cripto de
 * precio muy bajo— se ignoraba en silencio en vez de validarse por dirección.
 * Es el defecto 9.9 de la suite, del lado del formulario.
 */
export function precioOpcional(precio: number): number | undefined {
  return Number.isNaN(precio) ? undefined : precio;
}
