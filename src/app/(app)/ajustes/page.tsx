import SeccionCuenta from "@/components/ajustes/SeccionCuenta";
import SeccionTema from "@/components/ajustes/SeccionTema";
import SeccionUmbrales from "@/components/ajustes/SeccionUmbrales";
import SeccionBorrarCuenta from "@/components/ajustes/SeccionBorrarCuenta";

export default function AjustesPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">Ajustes</h1>

      <SeccionCuenta />

      <SeccionTema />

      <SeccionUmbrales />

      <SeccionBorrarCuenta />
    </div>
  );
}
