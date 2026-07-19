"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import SidebarTemaToggle from "@/components/SidebarTemaToggle";
import {
  IconoCuenta,
  IconoNuevaOperacion,
  IconoPosiciones,
  IconoResumen,
  IconoHistorial,
  IconoAlertas,
  IconoAjustes,
} from "@/components/navIcons";

type Item = {
  label: string;
  href: string | null;
  Icono: ComponentType<{ className?: string }>;
};

const items: Item[] = [
  { label: "Cuenta", href: "/cuenta", Icono: IconoCuenta },
  { label: "Nueva Operación", href: "/nueva-operacion", Icono: IconoNuevaOperacion },
  { label: "Posiciones Abiertas", href: "/posiciones-abiertas", Icono: IconoPosiciones },
  { label: "Resumen", href: "/dashboard", Icono: IconoResumen },
  { label: "Historial de operaciones", href: "/historial", Icono: IconoHistorial },
  { label: "Alertas", href: null, Icono: IconoAlertas },
  { label: "Ajustes", href: "/ajustes", Icono: IconoAjustes },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface px-3 py-4 sm:flex">
      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">
        Menú
      </p>

      <ul className="flex flex-1 flex-col gap-1">
        {items.map(({ label, href, Icono }) => {
          const activo = href != null && pathname.startsWith(href);
          return (
            <li key={label}>
              {href ? (
                <Link
                  href={href}
                  aria-current={activo ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    activo
                      ? "nav-activo"
                      : "text-foreground hover:bg-surface-muted"
                  }`}
                >
                  <Icono
                    className={`h-5 w-5 shrink-0 ${
                      activo ? "" : "text-foreground-muted"
                    }`}
                  />
                  {label}
                </Link>
              ) : (
                <span className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground-muted">
                  <Icono className="h-5 w-5 shrink-0 opacity-60" />
                  <span className="flex flex-1 items-center justify-between">
                    {label}
                    <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      Pronto
                    </span>
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 border-t border-border pt-4">
        <SidebarTemaToggle />
      </div>
    </nav>
  );
}
