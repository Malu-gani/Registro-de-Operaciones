/**
 * Política de contraseña única para toda la app: mínimo 8 caracteres con al
 * menos una minúscula, una mayúscula, un número y un carácter especial. Es la
 * fuente de verdad compartida entre el registro (`signup/actions.ts`) y el
 * cambio de contraseña en Ajustes (`SeccionCuenta.tsx`), para que las dos
 * pantallas no puedan desincronizarse.
 */

/** Texto de ayuda para mostrar debajo del campo de contraseña. */
export const REQUISITOS_PASSWORD_HINT =
  "Mínimo 8 caracteres, con mayúscula, minúscula, número y carácter especial.";

/** Requisitos que NO cumple la contraseña (arreglo vacío = cumple todos). */
export function requisitosPasswordFaltantes(password: string): string[] {
  const faltan: string[] = [];
  if (password.length < 8) faltan.push("al menos 8 caracteres");
  if (!/[a-z]/.test(password)) faltan.push("una minúscula");
  if (!/[A-Z]/.test(password)) faltan.push("una mayúscula");
  if (!/[0-9]/.test(password)) faltan.push("un número");
  if (!/[^A-Za-z0-9]/.test(password)) faltan.push("un carácter especial");
  return faltan;
}

/** Mensaje de error listo para mostrar, o `null` si la contraseña cumple. */
export function validarPassword(password: string): string | null {
  const faltan = requisitosPasswordFaltantes(password);
  if (faltan.length === 0) return null;
  return `La contraseña debe tener ${faltan.join(", ")}.`;
}
