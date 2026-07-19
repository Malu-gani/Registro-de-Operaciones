import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SCRIPT_TEMA_INICIAL } from "@/lib/tema";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gestor de Portfolio y Operaciones",
  description: "Seguimiento de operaciones con gestión de riesgo automática",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
