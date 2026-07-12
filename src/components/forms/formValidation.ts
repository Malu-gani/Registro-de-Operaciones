export function unirFaltantes(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

export function mensajeCamposFaltantes(items: string[]): string {
  return `Completá los siguientes campos obligatorios: ${unirFaltantes(items)}.`;
}
