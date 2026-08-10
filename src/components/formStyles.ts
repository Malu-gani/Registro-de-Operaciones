export const inputClasses =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";
export const labelClasses = "text-xs font-medium text-foreground-muted";

/**
 * Clases del grid de campos que comparten los 3 formularios de alta, según lo
 * que midió `useDosColumnas`.
 *
 * Emite UNA sola clase de columnas. Antes salían las dos juntas
 * (`grid-cols-1 ... grid-cols-2`) y andaba de casualidad: en el CSS que emite
 * Tailwind `grid-cols-2` viene después de `grid-cols-1` y gana la cascada. Cuál
 * de las dos gana no puede depender del orden de emisión de una herramienta.
 */
export function clasesGridColumnas(dosColumnas: boolean): string {
  return `grid gap-4 ${dosColumnas ? "grid-cols-2" : "grid-cols-1"}`;
}
