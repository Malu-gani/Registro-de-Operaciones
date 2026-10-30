export const inputClasses =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";
export const labelClasses = "text-xs font-medium text-foreground-muted";

/**
 * Grid de campos que comparten los 3 formularios de alta: UNA columna, siempre.
 *
 * No lleva breakpoint (OPS-BUG-01). CUIDADO AL LEER EL HISTORIAL DE ESTE
 * ARCHIVO: durante meses se creyó que la causa era que los Android reportaban
 * un ancho inflado, y fallaron cuatro intentos basados en eso (media query de
 * viewport, container queries CSS, ResizeObserver, y el menor entre contenedor
 * y ventana). Esa teoría era FALSA.
 *
 * La causa real resultó ser los `col-span-2` que habían quedado en los campos:
 * dentro de un `grid-cols-1`, una celda que pide dos tracks hace que el
 * navegador cree una segunda columna implícita y aplaste la primera (medido:
 * 157px en vez de 344px). No dependía del ancho ni del dispositivo. Está
 * documentado y fijado en `tests/unit/formColSpan.test.ts`.
 *
 * Esta constante quedó en una columna, que era la solución elegida cuando
 * todavía no se conocía la causa. Hoy ya no es obligatorio: con los `col-span`
 * afuera, volver a dos columnas en pantallas anchas es viable. Si se hace, hay
 * que actualizar los tests de abajo y verificar en un Android real antes de
 * darlo por bueno — este bug ya engañó cinco veces.
 */
export const clasesCamposFormulario = "grid grid-cols-1 gap-4";

/**
 * Layout externo de los 3 formularios de alta: el formulario y el panel de
 * riesgo, apilados siempre.
 *
 * Antes era `lg:grid-cols-2`. Se apiló al perseguir OPS-BUG-01, y esta parte SÍ
 * dio resultado: el usuario confirmó en el Xiaomi que el panel de riesgo pasó a
 * verse debajo del formulario. Pero ojo con la explicación vieja —se decía que
 * el teléfono reportaba un viewport inflado, y eso nunca se comprobó—; lo que
 * se arregló acá fue que el formulario dejara de vivir en media pantalla.
 *
 * Costo asumido: en pantallas anchas el panel de riesgo va debajo del
 * formulario en vez de al costado.
 */
export const clasesLayoutFormulario = "grid grid-cols-1 gap-6";
