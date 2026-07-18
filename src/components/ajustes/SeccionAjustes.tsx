/**
 * Contenedor visual de una sección de Ajustes: título, descripción opcional y
 * cuerpo dentro de una tarjeta. Unifica el look de las tres secciones (Cuenta,
 * Tema, Umbrales) para que cada una solo se ocupe de su contenido.
 */
export default function SeccionAjustes({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
        {descripcion && (
          <p className="text-xs text-foreground-muted">{descripcion}</p>
        )}
      </div>
      {children}
    </section>
  );
}
