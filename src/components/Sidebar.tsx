import Link from "next/link";

const items = [
  { label: "Cuenta", href: "/cuenta" },
  { label: "Nueva Operación", href: "/nueva-operacion" },
  { label: "Posiciones Abiertas", href: "/posiciones-abiertas" },
  { label: "Resumen", href: "/dashboard" },
  { label: "Historial de operaciones", href: "/historial" },
  { label: "Alertas", href: null },
  { label: "Ajustes", href: null },
];

export default function Sidebar() {
  return (
    <nav className="hidden w-56 shrink-0 border-r border-border bg-surface px-3 py-4 sm:block">
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.label}>
            {item.href ? (
              <Link
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
              >
                {item.label}
              </Link>
            ) : (
              <span className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-foreground-muted">
                {item.label}
                <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  Pronto
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
