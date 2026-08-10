"use client";

import { useState, type InputHTMLAttributes } from "react";

function IconoOjo({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
        <path
          d="M2.5 10s3-6 7.5-6 7.5 6 7.5 6-3 6-7.5 6-7.5-6-7.5-6Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="10" r="2.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <path
        d="M2.5 10s3-6 7.5-6c1.6 0 2.98.46 4.14 1.1M17.5 10s-1.06 2.12-3.14 3.9M7.6 15.2C8.35 15.4 9.15 15.5 10 15.5c4.5 0 7.5-6 7.5-6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 3l14 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * `<input type="password">` con un ícono para mostrar/ocultar el texto
 * (OPS-BUG-07/US-08). Reenvía todas las props al input, así que sirve tanto
 * para inputs controlados (value/onChange) como no controlados dentro de un
 * `<form action={...}>` de Server Action (solo necesita `name`).
 */
export default function PasswordInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative w-full">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`w-full pr-9 ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
      >
        <IconoOjo visible={visible} />
      </button>
    </div>
  );
}
