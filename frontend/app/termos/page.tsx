import DocumentoLegal, { type Secao } from '@/components/DocumentoLegal';

export const metadata = {
  title: 'Termos de Uso — Guará',
  description: 'As regras do jogo: o que o Guará faz, o que não faz, e o que se espera de cada lado.',
};

// [RESPONSÁVEL] — trocar por nome completo/razão social e CPF/CNPJ quando houver.
const RESPONSAVEL = 'Antony Araujo';
const EMAIL = 'antonycassioba@gmail.com';

const SECOES: Secao[] = [
  {
    titulo: '1. O que você está aceitando',
    paragrafos: [
      `Estes Termos são o acordo entre você e ${RESPONSAVEL}, responsável pelo Guará, sobre o uso do serviço. Ao mandar a primeira mensagem para o Guará no WhatsApp ou ao criar uma conta no painel, você concorda com o que está escrito aqui.`,
      'Escrevemos em português comum de propósito. Um termo que ninguém entende não protege ninguém — só cria a ilusão de ter avisado.',
      'Se você não concordar com algum ponto, o caminho é simples: não use o serviço, ou peça o encerramento da conta a qualquer momento. Não há multa, fidelidade nem burocracia.',
    ],
  },
  {
    titulo: '2. O que é o Guará',
    paragrafos: [
      'O Guará é um assistente financeiro automatizado. Você conta seus gastos e recebimentos por mensagem no WhatsApp, e ele organiza tudo — com um painel na web para ver gráficos, navegar entre meses e exportar planilha.',
      'A conversa é lida por inteligência artificial, que extrai valor, tipo e categoria do que você escreveu. Todos os cálculos (saldo, totais, comparações) são feitos pelo sistema, a partir dos dados guardados.',
      'O serviço é oferecido gratuitamente, como projeto pessoal. Não há mensalidade, não há plano pago, e não há publicidade.',
      'O Guará não é uma instituição financeira. Ele não movimenta dinheiro, não faz transferência, não emite boleto, não tem conta, não guarda saldo real e não se conecta ao seu banco. Ele apenas anota o que você conta.',
    ],
  },
  {
    titulo: '3. Sua conta e seu número',
    paragrafos: [
      'Seu número de telefone com WhatsApp é a chave da sua conta. É por ele que o Guará sabe que a mensagem é sua, e é a ele que todos os seus lançamentos ficam vinculados.',
      'Isso tem uma consequência prática que você precisa conhecer: quem tiver acesso ao seu WhatsApp consegue conversar com o Guará como se fosse você — registrar, consultar e apagar lançamentos. Proteja seu aparelho e seu WhatsApp como protegeria o aplicativo do seu banco.',
      'Você é responsável pelo que é feito a partir do seu número e da sua conta. Se perder o aparelho, ou desconfiar que alguém acessou seu WhatsApp, avise-nos para bloquearmos o vínculo.',
      'Se você trocar de número, avise. O número antigo, se for reatribuído a outra pessoa pela operadora, passaria a ter acesso ao seu histórico — e nós não temos como saber que isso aconteceu sem você nos dizer.',
      'A criação de conta no painel é opcional. O Guará funciona só pelo WhatsApp, para sempre, se você preferir assim.',
    ],
  },
  {
    titulo: '4. O Guará é uma ferramenta de registro, não um consultor',
    paragrafos: [
      'Esta cláusula é a mais importante do documento, e por isso está escrita sem rodeios.',
      'O Guará organiza informação que VOCÊ forneceu. Ele não presta consultoria financeira, não recomenda investimento, não indica produto bancário, não avalia crédito e não sugere o que você deve fazer com seu dinheiro. Nada do que ele mostra deve ser entendido como recomendação.',
      'As decisões sobre a sua vida financeira são suas, e a responsabilidade por elas também. Se você olhar um saldo no Guará e decidir gastar, investir, emprestar, quitar ou deixar de pagar algo, essa decisão é sua.',
      'Os números que o Guará mostra dependem inteiramente do que foi registrado. Se você esqueceu de anotar um gasto, digitou um valor errado, ou a inteligência artificial classificou uma frase de forma diferente da que você quis dizer, o resultado estará errado — e o app não tem como saber disso.',
      'Por isso: confira seus dados. O Guará é um caderno inteligente, não uma fonte de verdade sobre sua vida financeira. O extrato do seu banco é.',
      'Não nos responsabilizamos por prejuízo financeiro decorrente de decisão tomada com base em informação registrada no Guará, incluindo erro de digitação, classificação automática incorreta, lançamento esquecido ou dado desatualizado.',
    ],
  },
  {
    titulo: '5. O serviço é fornecido como está',
    paragrafos: [
      'O Guará é oferecido "no estado em que se encontra", sem garantia de funcionamento ininterrupto, de ausência de falhas ou de resultado específico.',
      'Ele depende de serviços de terceiros que não controlamos:',
      [
        'WhatsApp e a plataforma da Meta — se ela ficar fora do ar, mudar regras ou suspender o número, o Guará para de receber e enviar mensagens.',
        'A inteligência artificial do Google — se ficar indisponível ou sobrecarregada, mensagens podem não ser interpretadas naquele momento.',
        'A infraestrutura de nuvem (Supabase e Oracle Cloud) — usada em plano gratuito, sujeita a limites e a interrupção.',
      ],
      'Fazemos o razoável para manter tudo de pé: há monitoramento automático, cópia de segurança diária e verificação de código antes de cada publicação. Mas não prometemos disponibilidade contínua, e não há prazo garantido de restabelecimento.',
      'Também podemos alterar, suspender ou encerrar funcionalidades a qualquer tempo. Se o serviço for descontinuado, avisaremos com pelo menos 30 dias de antecedência pelo WhatsApp, e nesse período você poderá exportar todos os seus dados em planilha.',
    ],
  },
  {
    titulo: '6. O que você se compromete a não fazer',
    paragrafos: [
      'Ao usar o Guará, você concorda em não:',
      [
        'Usar o serviço para atividade ilícita, ou para registrar operação de origem criminosa.',
        'Tentar acessar dados de outra pessoa, burlar os controles de acesso ou explorar falhas do sistema.',
        'Automatizar o envio de mensagens em volume, ou usar o serviço de forma que prejudique seu funcionamento para os demais.',
        'Fazer engenharia reversa da infraestrutura, ou tentar extrair credenciais e chaves de acesso.',
        'Se passar por outra pessoa, ou registrar número de telefone que não seja seu.',
      ],
      'Se identificarmos uso nesses termos, podemos suspender ou encerrar a conta, com aviso quando for possível e sem aviso quando houver risco a terceiros ou ao serviço.',
      'Encontrou uma falha de segurança? Escreva para nós antes de divulgá-la. Agradecemos de verdade — é assim que o serviço fica melhor para todo mundo.',
    ],
  },
  {
    titulo: '7. Seus dados são seus',
    paragrafos: [
      'Tudo que você registra no Guará continua sendo seu. Não reivindicamos propriedade sobre seus lançamentos, e não os usamos para nenhuma finalidade além de mostrá-los de volta a você.',
      'Você pode exportar tudo em planilha, a qualquer momento, pelo painel — sem pedir autorização e sem custo.',
      'Você pode encerrar a conta quando quiser: pelo chat, escrevendo "quero apagar meus dados", ou pelo e-mail abaixo. A exclusão é definitiva, e não temos como desfazê-la depois que as cópias de segurança expirarem.',
      'O tratamento dos seus dados pessoais é detalhado na Política de Privacidade, que faz parte integrante destes Termos.',
    ],
  },
  {
    titulo: '8. Propriedade do serviço',
    paragrafos: [
      'O nome Guará, a identidade visual, os textos e o código do aplicativo pertencem ao responsável pelo projeto.',
      'O código-fonte é mantido em repositório público, e pode ser lido e estudado por qualquer pessoa. Isso não transfere direitos sobre a marca nem sobre a operação do serviço.',
      'Você recebe uma licença pessoal, gratuita, não exclusiva e revogável para usar o Guará conforme estes Termos. Nada além disso.',
    ],
  },
  {
    titulo: '9. Limite de responsabilidade',
    paragrafos: [
      'Como o serviço é gratuito e oferecido como projeto pessoal, nossa responsabilidade se limita ao que a lei brasileira determina como irrenunciável.',
      'Não respondemos por lucro cessante, perda de oportunidade, dano indireto, nem por prejuízo decorrente de indisponibilidade dos serviços de terceiros dos quais o Guará depende.',
      'Nada nestes Termos afasta seus direitos como consumidor previstos no Código de Defesa do Consumidor, nem os direitos garantidos pela Lei Geral de Proteção de Dados.',
    ],
  },
  {
    titulo: '10. Mudanças nestes Termos',
    paragrafos: [
      'Podemos atualizar este documento conforme o serviço evoluir. A data no topo sempre indica a versão vigente.',
      'Mudanças relevantes serão avisadas pelo WhatsApp antes de entrarem em vigor. Continuar usando o Guará depois do aviso significa que você concordou com a nova versão; se não concordar, peça o encerramento da conta.',
      'Cada alteração fica registrada no repositório público do projeto, com data e motivo.',
    ],
  },
  {
    titulo: '11. Lei aplicável e contato',
    paragrafos: [
      'Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro do domicílio do usuário para dirimir eventuais controvérsias, conforme o Código de Defesa do Consumidor.',
      `Dúvidas, pedidos e reclamações: ${EMAIL}. Respondemos em até 15 dias corridos.`,
    ],
  },
];

export default function Termos() {
  return (
    <DocumentoLegal
      titulo="Termos de Uso"
      atualizado="27 de agosto de 2026"
      resumo="As regras do jogo: o que o Guará faz, o que ele não faz, e o que se espera de cada lado."
      secoes={SECOES}
      outroDocumento={{ href: '/privacidade', rotulo: 'Ler a Política de Privacidade' }}
    />
  );
}
