/**
 * Traduce los mensajes crudos de Supabase Auth (en inglés) a español. Cualquier
 * mensaje no mapeado cae en un genérico, así nunca llega texto en inglés al
 * usuario.
 */
export function traducirErrorAuth(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("email not confirmed")) {
    return "Todavía no confirmaste tu email. Revisá tu casilla o reenviá el correo.";
  }
  if (m.includes("invalid login credentials")) {
    return "Email o contraseña incorrectos.";
  }
  if (m.includes("rate limit")) {
    return "Demasiados intentos. Esperá unos minutos y probá de nuevo.";
  }
  if (m.includes("user already registered")) {
    return "Ya existe una cuenta con ese email.";
  }
  return "No se pudo completar la operación. Probá de nuevo.";
}

/** True si el error es específicamente "email sin confirmar". */
export function esEmailSinConfirmar(mensaje: string): boolean {
  return mensaje.toLowerCase().includes("email not confirmed");
}
