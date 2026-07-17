/**
 * Dispara la descarga de un Blob en el navegador (patrón client-side estándar:
 * object URL + <a download> + revoke). Compartido por los exportadores.
 */
export function descargarBlob(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Nombre de archivo con fecha del día: `historial-operaciones-2026-07-17.csv`. */
export function nombreConFecha(base: string, extension: string): string {
  const hoy = new Date().toISOString().slice(0, 10);
  return `${base}-${hoy}.${extension}`;
}
