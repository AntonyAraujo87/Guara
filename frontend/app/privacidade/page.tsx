import Link from "next/link";

export const metadata = {
  title: "Privacidade — Guará",
};

const SECOES = [
  {
    titulo: "O que é o Guará",
    texto: "Guará é um app pessoal de controle financeiro. Você registra gastos, recebimentos e dívidas mandando mensagem no WhatsApp, e acompanha tudo em um painel na web.",
  },
  {
    titulo: "Quais dados guardamos",
    texto: "Seu número de telefone, e-mail (usado para login), e os lançamentos que você registra (valor, categoria, descrição, data). Se você entrar com Google, recebemos seu nome e e-mail associados à conta Google.",
  },
  {
    titulo: "Como usamos seus dados",
    texto: "Só para operar o app: identificar sua conta, associar suas mensagens do WhatsApp ao seu painel, e exibir seus próprios dados financeiros de volta pra você. As mensagens que você manda são processadas por um modelo de IA (Google Gemini) só pra extrair valor, categoria e descrição — não são usadas para treinar modelos nem compartilhadas com terceiros.",
  },
  {
    titulo: "Quem mais tem acesso",
    texto: "Nunca vendemos, alugamos nem compartilhamos seus dados para fins comerciais. Mas o Guará é feito de serviços de terceiros, e é justo você saber quais tocam nos seus dados: a Meta entrega as mensagens do WhatsApp; o Google (Gemini) lê o texto da mensagem para extrair valor e categoria; o Supabase guarda o banco e cuida do login; a Cloudflare verifica que quem se cadastra é uma pessoa. Cada um vê só o pedaço de que precisa, e nenhum deles usa seus dados para treinar modelo ou montar perfil.",
  },
  {
    titulo: "Por quanto tempo guardamos",
    texto: "Seus lançamentos ficam enquanto sua conta existir — o histórico é o próprio produto. Fazemos uma cópia de segurança por dia, guardada por 14 dias. Isso significa que, depois de você apagar algo, ele ainda pode existir nessas cópias por até duas semanas antes de sumir de vez.",
  },
  {
    titulo: "Seus direitos",
    texto: "Você pode apagar qualquer lançamento direto no painel, ou pedir ao Guará no WhatsApp. Pode baixar tudo em planilha quando quiser, pelo botão no painel. Para corrigir, exportar ou excluir sua conta inteira, escreva no e-mail abaixo — respondemos em até 15 dias. Você também pode retirar seu consentimento a qualquer momento; nesse caso a conta é encerrada, porque sem os dados não há o que mostrar.",
  },
];

export default function Privacidade() {
  return (
    <main className="min-h-screen bg-[var(--areia)] px-4 py-8 sm:py-12">
      <div className="max-w-2xl mx-auto">
        <div className="bloco px-7 py-8 mb-4" style={{ backgroundColor: "var(--ferrugem)" }}>
          <h1 className="titulo text-4xl sm:text-5xl leading-none">Privacidade</h1>
          <p className="rotulo text-xs mt-4 opacity-90">Atualizado em 27 de agosto de 2026</p>
        </div>

        <div className="bg-[var(--creme)] rounded-2xl border-2 border-[var(--borda)] p-7 sm:p-9">
          <div className="space-y-8">
            {SECOES.map((secao) => (
              <section key={secao.titulo}>
                <h2 className="titulo text-xl text-[var(--tinta)] mb-2">{secao.titulo}</h2>
                <p className="text-lg text-[var(--tinta-media)] leading-relaxed">{secao.texto}</p>
              </section>
            ))}

            <section>
              <h2 className="titulo text-xl text-[var(--tinta)] mb-2">Contato</h2>
              <p className="text-lg text-[var(--tinta-media)] leading-relaxed">
                Dúvidas sobre privacidade:{" "}
                <a
                  href="mailto:antonycassioba@gmail.com"
                  className="text-[var(--ferrugem)] font-semibold underline underline-offset-2"
                >
                  antonycassioba@gmail.com
                </a>
              </p>
            </section>
          </div>
        </div>

        <p className="mt-6 text-center">
          <Link href="/" className="rotulo text-sm text-[var(--tinta-media)] underline underline-offset-4">
            Voltar para o Guará
          </Link>
        </p>
      </div>
    </main>
  );
}
