/** Adónde se manda al usuario cuando el `next` recibido no es confiable. */
const RUTA_POR_DEFECTO = "/dashboard";

/**
 * Valida el parámetro `next` de los callbacks de auth antes de concatenarlo a
 * la base del sitio. Devuelve la ruta si es interna, o `/dashboard` si no.
 *
 * Por qué hace falta: los callbacks arman el redirect como `${base}${next}` y
 * `NEXT_PUBLIC_SITE_URL` va sin barra final, así que un `next` que arranque con
 * "@" convierte el dominio propio en la parte *userinfo* de la URL y el host
 * pasa a ser el del atacante:
 *
 *   "https://mi-app.vercel.app" + "@evil.com" -> host = evil.com
 *
 * Como el redirect ocurre DESPUÉS de escribir las cookies de sesión, un link
 * así podía dejar a la víctima logueada con la sesión del atacante y mandarla
 * a un dominio ajeno, todo bajo una URL que empieza con el dominio real.
 *
 * Se acepta únicamente una barra seguida de algo que no sea otra barra ni una
 * barra invertida: eso descarta "//evil.com" y "/\evil.com" (los navegadores
 * normalizan "\" a "/", así que valen lo mismo que "//"), y de paso cualquier
 * URL absoluta, que nunca arranca con barra.
 */
export function rutaInternaSegura(next: string | null): string {
  if (!next) return RUTA_POR_DEFECTO;
  return /^\/(?![/\\])/.test(next) ? next : RUTA_POR_DEFECTO;
}
