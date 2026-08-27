import type { Metadata } from "next";
import { Archivo, Figtree } from "next/font/google";
import "./globals.css";

// Archivo (Omnibus-Type) no eixo expandido: cara de placa, lê de longe.
const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["wdth"],
});

// Figtree no corpo: redonda e aberta, segura a leitura em corpo grande.
const figtree = Figtree({
  variable: "--font-corpo",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Guará",
  description: "Seus gastos e recebimentos, organizados pelo WhatsApp",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${archivo.variable} ${figtree.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
