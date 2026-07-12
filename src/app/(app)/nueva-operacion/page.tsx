"use client";

import { useState } from "react";
import AccionesForm from "@/components/forms/AccionesForm";
import CryptoForm from "@/components/forms/CryptoForm";
import PlazoFijoForm from "@/components/forms/PlazoFijoForm";

const tabs = [
  { id: "acciones", label: "Acciones" },
  { id: "crypto", label: "Cripto" },
  { id: "plazo-fijo", label: "Plazo fijo" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function NuevaOperacionPage() {
  const [tab, setTab] = useState<TabId>("acciones");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap gap-2 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-brand text-foreground"
                : "border-transparent text-foreground-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "acciones" && <AccionesForm />}
      {tab === "crypto" && <CryptoForm />}
      {tab === "plazo-fijo" && <PlazoFijoForm />}
    </div>
  );
}
