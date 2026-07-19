"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "Cuenta", href: "/cuenta" },
  { label: "Nueva Operación", href: "/nueva-operacion" },
  { label: "Posiciones Abiertas", href: "/posiciones-abiertas" },
  { label: "Resumen", href: "/dashboard" },
  { label: "Historial de operaciones", href: "/historial" },
  { label: "Alertas", href: null },
  { label: "Ajustes", href: "/ajustes" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-56 shrink-0 border-r border-border bg-surface px-3 py-4 sm:block">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const activo = item.href != null && pathname.startsWith(item.href);
          return (
            <li key={item.label}>
              {item.href ? (
                <Link
                  href={item.href}
                  aria-current={activo ? "page" : undefined}
                  className={`relative block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    activo
                      ? "bg-brand/10 text-foreground"
                      : "text-foreground hover:bg-surface-muted"
                  }`}
                >
                  {/*
                    La barrita del ítem activo se deja SIEMPRE en el DOM y solo
                    cambia de color con la clase. Si se renderizara condicional
                    ({activo && <span/>}), al navegar React tendría que
                    insertarla/quitarla justo al lado del texto del ítem; cuando
                    el navegador traduce la página (Google Translate reemplaza
                    los textos por nodos <font> propios), ese texto ya no es el
                    nodo que React referencia y el insertBefore explota con
                    "NotFoundError". Manteniéndola fija, solo se actualiza un
                    atributo (seguro con la traducción).
                  */}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-1.5 left-0 w-1 rounded-full ${
                      activo ? "bg-brand" : "bg-transparent"
                    }`}
                  />
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
          );
        })}
      </ul>
    </nav>
  );
}
