"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  IconoCuenta,
  IconoNuevaOperacion,
  IconoPosiciones,
  IconoResumen,
  IconoHistorial,
  IconoAjustes,
} from "@/components/navIcons";

// Solo las secciones ya disponibles (las de "Pronto" del Sidebar quedan
// fuera de la barra inferior). Etiquetas cortas para que entren en una fila.
const items: {
  label: string;
  href: string;
  Icono: ComponentType<{ className?: string }>;
}[] = [
  { label: "Cuenta", href: "/cuenta", Icono: IconoCuenta },
  { label: "Nueva", href: "/nueva-operacion", Icono: IconoNuevaOperacion },
  { label: "Posiciones", href: "/posiciones-abiertas", Icono: IconoPosiciones },
  { label: "Resumen", href: "/dashboard", Icono: IconoResumen },
  { label: "Historial", href: "/historial", Icono: IconoHistorial },
  { label: "Ajustes", href: "/ajustes", Icono: IconoAjustes },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface sm:hidden">
      {items.map(({ label, href, Icono }) => {
        const activo =
          pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-1 border-t-2 px-1 py-2 text-center text-[10px] font-medium leading-tight transition-colors ${
              activo
                ? "border-brand bg-brand/10 text-brand"
                : "border-transparent text-foreground-muted"
            }`}
          >
            <Icono className="h-5 w-5 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
