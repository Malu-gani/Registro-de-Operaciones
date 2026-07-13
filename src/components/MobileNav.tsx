"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Solo las secciones ya disponibles (las de "Pronto" del Sidebar quedan
// fuera de la barra inferior). Etiquetas cortas para que entren en una fila.
const items = [
  { label: "Resumen", href: "/dashboard" },
  { label: "Nueva", href: "/nueva-operacion" },
  { label: "Posiciones", href: "/posiciones-abiertas" },
  { label: "Historial", href: "/historial" },
  { label: "Portafolios", href: "/portafolio" },
  { label: "Cuenta", href: "/cuenta" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface sm:hidden">
      {items.map((item) => {
        const activo =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center border-t-2 px-1 py-2.5 text-center text-[11px] font-medium leading-tight transition-colors ${
              activo
                ? "border-brand text-brand"
                : "border-transparent text-foreground-muted"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
