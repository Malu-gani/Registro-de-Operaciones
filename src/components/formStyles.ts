export const inputClasses =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";
export const labelClasses = "text-xs font-medium text-foreground-muted";

/**
 * Grid de campos que comparten los 3 formularios de alta: UNA columna, siempre.
 *
 * No lleva breakpoint a propósito (OPS-BUG-01). En dos Android reales el grid
 * salía a 2 columnas apretadas con los campos superpuestos, y fallaron cuatro
 * intentos de arreglarlo, todos decidiendo por ancho: media query de viewport,
 * container queries CSS, medir el contenedor con ResizeObserver, y tomar el
 * menor entre contenedor y ventana. Que el último también fallara probó que en
 * esos dispositivos ninguna medida de ancho es confiable.
 *
 * Una columna no puede superponerse: no hay nada que medir mal. El costo es
 * densidad en pantallas anchas, donde el formulario queda más largo. Se eligió
 * a conciencia: el formulario ya vive en media pantalla junto al panel de
 * riesgo, así que una columna de campos ahí es la disposición normal igual.
 *
 * Si alguien vuelve a meter un breakpoint acá, reabre el bug.
 */
export const clasesCamposFormulario = "grid grid-cols-1 gap-4";
