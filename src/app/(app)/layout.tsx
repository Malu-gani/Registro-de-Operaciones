import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import { TradesProvider } from "@/context/TradesContext";
import { PlazosFijosProvider } from "@/context/PlazosFijosContext";
import { MovimientosFuturosProvider } from "@/context/MovimientosFuturosContext";
import { PortafoliosProvider } from "@/context/PortafoliosContext";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <PortafoliosProvider>
      <TradesProvider>
        <PlazosFijosProvider>
          <MovimientosFuturosProvider>
            <div className="flex h-full flex-col">
              <Navbar userEmail={user.email ?? ""} />
              <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto bg-background p-6 pb-24 sm:pb-6">
                  {children}
                </main>
              </div>
              <MobileNav />
            </div>
          </MovimientosFuturosProvider>
        </PlazosFijosProvider>
      </TradesProvider>
    </PortafoliosProvider>
  );
}
