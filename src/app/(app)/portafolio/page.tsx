import { redirect } from "next/navigation";

// "Portafolios" dejó de ser una pestaña propia: su contenido (distribución y
// gestión) vive ahora embebido en /cuenta. Esta ruta se mantiene solo como
// redirect por si algún link o bookmark viejo la usa.
export default function PortafolioPage() {
  redirect("/cuenta");
}
