import type { Metadata, Viewport } from "next";
import { Archivo, Figtree } from "next/font/google";
import "./globals.css";
import SemInsistencia from "@/components/SemInsistencia";

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

const PAINEL_URL = "https://guarapp.duckdns.org";

export const metadata: Metadata = {
  title: "Guará",
  description: "Seus gastos e recebimentos, organizados pelo WhatsApp",
  manifest: "/manifest.json",
  // Sem isso o iOS abre o atalho no Safari com barra de endereço, em vez de
  // em tela cheia como um app.
  appleWebApp: {
    capable: true,
    title: "Guará",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icone-192.png",
    apple: "/icone-192.png",
  },
  // Faz o link virar um cartão com ícone quando compartilhado no WhatsApp,
  // em vez de chegar como texto pelado. URL absoluta porque quem monta a
  // prévia é o servidor do WhatsApp, não o navegador de quem recebe.
  metadataBase: new URL(PAINEL_URL),
  openGraph: {
    type: "website",
    siteName: "Guará",
    title: "Guará",
    description: "Seus gastos e recebimentos, organizados pelo WhatsApp",
    url: PAINEL_URL,
    images: [{ url: "/icone-512.png", width: 512, height: 512, alt: "Guará" }],
  },
};

// A barra do sistema acompanha o tema do aparelho; a cor tem que trocar junto,
// senão o topo da tela fica claro com o app escuro.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#efe3d2" },
    { media: "(prefers-color-scheme: dark)", color: "#14100b" },
  ],
  // A tela cheia do PWA cobre a área do notch; sem isso sobra faixa branca.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${archivo.variable} ${figtree.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SemInsistencia />
        {children}
      </body>
    </html>
  );
}
