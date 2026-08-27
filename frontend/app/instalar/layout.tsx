import type { Metadata } from "next";

const PAINEL = "https://guarapp.duckdns.org";

// Sem isto o link chega no WhatsApp como texto pelado. Com isto ele vira um
// cartão com o ícone do Guará — que é o que faz parecer um app, e não um
// endereço qualquer. A imagem precisa de URL absoluta: quem monta a prévia é
// o servidor do WhatsApp, que não sabe de onde o caminho relativo sairia.
export const metadata: Metadata = {
  title: "Instalar o Guará",
  description: "Deixe seu controle de gastos na tela inicial do celular. 20 segundos, sem loja.",
  openGraph: {
    type: "website",
    siteName: "Guará",
    title: "Instalar o Guará",
    description: "Deixe seu controle de gastos na tela inicial do celular. 20 segundos, sem loja.",
    url: `${PAINEL}/instalar`,
    images: [{ url: `${PAINEL}/icone-512.png`, width: 512, height: 512, alt: "Guará" }],
  },
};

export default function LayoutInstalar({ children }: { children: React.ReactNode }) {
  return children;
}
