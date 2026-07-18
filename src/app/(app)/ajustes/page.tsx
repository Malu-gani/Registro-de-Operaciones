import SeccionCuenta from "@/components/ajustes/SeccionCuenta";
import SeccionAjustes from "@/components/ajustes/SeccionAjustes";

export default function AjustesPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">Ajustes</h1>

      <SeccionCuenta />

      <SeccionAjustes
        titulo="Tema"
        descripcion="Claro, oscuro o automático según tu sistema."
      >
        <p className="text-xs text-foreground-muted">En construcción.</p>
      </SeccionAjustes>

      <SeccionAjustes
        titulo="Semáforo de riesgo"
        descripcion="Personalizá los cortes de riesgo bajo / medio / alto por tipo de activo."
      >
        <p className="text-xs text-foreground-muted">En construcción.</p>
      </SeccionAjustes>
    </div>
  );
}
