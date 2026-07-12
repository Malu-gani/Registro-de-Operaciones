"use client";

import { useEffect, useRef, useState } from "react";
import type { AssetSearchResult } from "@/lib/marketData";
import { inputClasses, labelClasses } from "./formStyles";

export default function AssetAutocomplete({
  label = "Activo",
  value,
  onChange,
  onSelect,
  placeholder,
  tipo,
  mercado,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (resultado: AssetSearchResult) => void;
  placeholder?: string;
  /** Restringe la búsqueda a un tipo de activo (evita mezclar cripto y acciones). */
  tipo?: "crypto" | "stock";
  /** Restringe acciones a CEDEAR (.BA, ARS) o acción original (USD). */
  mercado?: "cedear" | "usd";
}) {
  const [sugerencias, setSugerencias] = useState<AssetSearchResult[]>([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [activoSeleccionado, setActivoSeleccionado] =
    useState<AssetSearchResult | null>(null);
  const [precioActual, setPrecioActual] = useState<{
    price: number;
    currency: string;
  } | null>(null);
  const [precioCargando, setPrecioCargando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (activoSeleccionado && value !== activoSeleccionado.symbol) {
      setActivoSeleccionado(null);
      setPrecioActual(null);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = value.trim();
    if (query.length < 2) {
      setSugerencias([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const tipoQuery = tipo ? `&tipo=${tipo}` : "";
        const mercadoQuery = mercado ? `&mercado=${mercado}` : "";
        const res = await fetch(
          `/api/market/search?q=${encodeURIComponent(query)}${tipoQuery}${mercadoQuery}`
        );
        const json = await res.json();
        setSugerencias(json.results ?? []);
      } catch {
        setSugerencias([]);
      } finally {
        setBuscando(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, tipo, mercado]);

  const elegirActivo = async (resultado: AssetSearchResult) => {
    onChange(resultado.symbol);
    onSelect(resultado);
    setActivoSeleccionado(resultado);
    setMostrarSugerencias(false);
    setSugerencias([]);
    setPrecioCargando(true);
    setPrecioActual(null);
    try {
      const res = await fetch(
        `/api/market/price?id=${encodeURIComponent(
          resultado.id
        )}&type=${resultado.type}`
      );
      if (res.ok) {
        const json = await res.json();
        setPrecioActual(
          typeof json.price === "number"
            ? { price: json.price, currency: json.currency ?? "USD" }
            : null
        );
      }
    } catch {
      setPrecioActual(null);
    } finally {
      setPrecioCargando(false);
    }
  };

  return (
    <label className="relative flex flex-col gap-1">
      <span className={labelClasses}>{label}</span>
      <input
        className={inputClasses}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setMostrarSugerencias(true)}
        onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
        placeholder={placeholder ?? "BTC, AAPL..."}
        autoComplete="off"
      />

      {mostrarSugerencias && (buscando || sugerencias.length > 0) && (
        <ul className="absolute top-full z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-surface shadow-lg">
          {buscando && (
            <li className="px-3 py-2 text-xs text-foreground-muted">
              Buscando...
            </li>
          )}
          {!buscando &&
            sugerencias.map((s) => (
              <li key={`${s.type}-${s.id}`}>
                <button
                  type="button"
                  onMouseDown={() => elegirActivo(s)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
                >
                  <span className="text-foreground">
                    {s.symbol}{" "}
                    <span className="text-foreground-muted">{s.name}</span>
                  </span>
                  <span className="text-xs uppercase text-foreground-muted">
                    {s.type === "crypto" ? "Cripto" : "Acción"}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}

      {activoSeleccionado && (
        <span className="text-xs text-foreground-muted">
          {precioCargando
            ? "Consultando precio actual..."
            : precioActual !== null
            ? `Precio actual de mercado: ${
                precioActual.currency
              } ${precioActual.price.toLocaleString()}`
            : "No se pudo obtener el precio actual."}
        </span>
      )}
    </label>
  );
}
