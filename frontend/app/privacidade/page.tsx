import DocumentoLegal, { type Secao } from '@/components/DocumentoLegal';

export const metadata = {
  title: 'Privacidade — Guará',
  description: 'O que o Guará guarda, por quê, e o que você pode fazer a respeito.',
};

// Nome civil completo, como pede documento legal. Se um dia houver CNPJ,
// trocar por razão social e acrescentar o número.
const CONTROLADOR = 'Antony Cassio Bandeira Araujo';
const EMAIL = 'guarafinancas@gmail.com';

const SECOES: Secao[] = [
  {
    titulo: '1. Em resumo',
    paragrafos: [
      'O Guará é um app pessoal de controle financeiro. Você registra gastos e recebimentos mandando mensagem no WhatsApp, e acompanha tudo num painel na web.',
      'Guardamos o mínimo para o app funcionar: seu número de telefone, seu e-mail e os lançamentos que você mesmo registra. Não vendemos, não alugamos e não cedemos seus dados financeiros para banco, corretora, seguradora, anunciante ou qualquer outro terceiro — nem de graça, nem por dinheiro.',
      'Esta política explica isso em detalhe, na ordem que a Lei Geral de Proteção de Dados (Lei 13.709/2018) espera. Se algo aqui não estiver claro, escreva para nós: a obrigação de explicar é nossa, não sua.',
    ],
  },
  {
    titulo: '2. Quem é responsável pelos seus dados',
    paragrafos: [
      `O controlador dos dados — quem decide o que é coletado e para quê — é ${CONTROLADOR}, pessoa física, responsável pelo desenvolvimento e operação do Guará.`,
      `Todo contato sobre privacidade, incluindo pedidos de acesso, correção ou exclusão, deve ser feito pelo e-mail ${EMAIL}. Respondemos em até 15 (quinze) dias corridos.`,
      'O Guará é um projeto pessoal, oferecido gratuitamente. Não há encarregado de proteção de dados formalmente designado, e o canal acima cumpre essa função de contato.',
    ],
  },
  {
    titulo: '3. Quais dados coletamos',
    paragrafos: [
      'Coletamos apenas o necessário para o app funcionar. Nada é inferido, comprado de terceiros ou cruzado com outras bases.',
      'Dados de identificação e acesso:',
      [
        'Número de telefone com WhatsApp — é a chave que liga suas mensagens à sua conta.',
        'Endereço de e-mail — usado para entrar no painel e recuperar acesso.',
        'Nome e foto de perfil, apenas se você escolher entrar com Google. Não temos acesso à sua senha do Google.',
        'Data e hora da sua última mensagem — necessária por regra do WhatsApp, que só permite ao Guará responder dentro de 24 horas após você escrever.',
      ],
      'Dados que você registra:',
      [
        'O texto das mensagens que você envia ao Guará.',
        'Lançamentos financeiros: valor, tipo (entrada ou saída), categoria, descrição e data.',
        'Dívidas e combinados, incluindo o nome que você citar da outra pessoa.',
        'Parcelamentos, dinheiro guardado, cofrinhos e metas que você definir.',
        'Categorias personalizadas que você criar.',
        'Nomes das carteiras, se você separar o dinheiro em mais de uma (por exemplo, pessoal e trabalho). São nomes escolhidos por você — não pedimos CPF, CNPJ nem qualquer documento para isso.',
      ],
      'Áudio e foto, apenas de passagem:',
      [
        'Se você mandar um áudio, ele é transcrito e o texto vira o lançamento. O arquivo de áudio NÃO é guardado.',
        'Se mandar a foto de um comprovante, nota ou print de transferência, o valor e o estabelecimento são lidos dela. A imagem NÃO é guardada.',
        'Nos dois casos o arquivo existe apenas na memória do servidor durante os segundos do processamento, e é descartado em seguida. Não vai para banco de dados nem para cópia de segurança.',
        'Vídeo, documento, figurinha e localização continuam sem ser processados: o Guará avisa que não lê aquele formato e descarta.',
      ],
      'Códigos temporários: ao vincular seu telefone à conta, geramos um código de 6 dígitos válido por 10 minutos. Ele é apagado assim que usado.',
      'Não coletamos sua localização, sua lista de contatos, dados do aparelho para rastreamento, nem dados bancários. O Guará nunca pede senha de banco, número de cartão, chave PIX ou acesso a qualquer conta financeira — e nunca vai pedir. Se algo se passando pelo Guará pedir isso, é golpe.',
      'Uma consequência prática de ler áudio e foto: o que estiver no arquivo passa pela inteligência artificial. Uma foto de comprovante costuma mostrar seu nome, e às vezes os quatro últimos dígitos do cartão. Isso é lido junto, embora só o valor e o estabelecimento sejam guardados. Se preferir não correr esse risco, digite o valor — o resultado é o mesmo.',
    ],
  },
  {
    titulo: '4. Por que tratamos cada dado (base legal)',
    paragrafos: [
      'A LGPD exige que todo tratamento tenha uma base legal declarada. As nossas:',
      [
        'Execução de contrato (art. 7º, V): telefone, e-mail, mensagens e lançamentos. Sem eles não existe o serviço que você pediu — não há como anotar um gasto sem guardar o gasto.',
        'Cumprimento de obrigação legal (art. 7º, II): registros mínimos de acesso, quando exigidos pelo Marco Civil da Internet.',
        'Legítimo interesse (art. 7º, IX): registros técnicos de erro e as verificações automáticas que detectam se o serviço caiu. Esses registros não contêm o conteúdo das suas mensagens.',
        'Consentimento (art. 7º, I): apenas para o login com Google, que é opcional.',
      ],
      'Não usamos seus dados para publicidade, para criar perfil de consumo, para pontuação de crédito, nem para qualquer decisão automatizada que afete você juridicamente.',
    ],
  },
  {
    titulo: '5. Como a inteligência artificial entra nisso',
    paragrafos: [
      'Esta é a parte que merece a explicação mais franca, porque é a que mais gera dúvida.',
      'Quando você manda uma mensagem, o texto é enviado ao Gemini, modelo de inteligência artificial do Google. A função dele é uma só: ler a frase e devolver o que ela significa em campos estruturados — que valor, que tipo, que categoria, que descrição.',
      'O Gemini não calcula seu saldo, não decide nada e não guarda seu histórico. Todo cálculo — saldo, totais, gráficos, comparações entre meses — é feito pelo nosso próprio sistema, a partir do banco de dados. Essa separação é deliberada: modelo de linguagem erra número com confiança, e num app de dinheiro isso seria inaceitável.',
      'Se você mandar áudio, ele é transcrito pelo mesmo Gemini. Se mandar foto de comprovante, o valor e o estabelecimento são lidos dela. Nos dois casos a mídia vai ao Google só para virar texto, e o texto segue o caminho de uma mensagem escrita. O arquivo não é guardado por nós em lugar nenhum — nem em banco, nem em backup.',
      'O que é enviado ao Google: o texto daquela mensagem (limitado a 1.000 caracteres) ou o arquivo de áudio/imagem daquele envio; a lista de nomes das suas categorias e das suas carteiras, para que ele saiba reconhecê-las; e a data de hoje, para entender expressões como "ontem" ou "na terça". Não enviamos seu telefone, seu e-mail, seu nome nem seu histórico de lançamentos.',
      'IMPORTANTE, E PRECISA SER DITO SEM MAQUIAGEM: usamos o plano gratuito da API do Google. Nos termos do Google, o conteúdo enviado pelos serviços NÃO PAGOS pode ser usado por ele para melhorar seus produtos, o que inclui revisão humana por parte do Google. A garantia de não uso para treinamento vale para os planos pagos, que não é o nosso caso. Enquanto o Guará for gratuito, é assim.',
      'A consequência prática: não mande ao Guará informação que você não queira que passe pelo Google. Senha, número completo de cartão, documento, dado de saúde. Para registrar um gasto, um valor e uma palavra bastam — e é por isso que o Guará nunca pede nada além disso.',
      'Se essa política do Google mudar de forma relevante, atualizamos este documento e avisamos pelo WhatsApp.',
      'Nenhuma pessoa lê suas mensagens. O processamento é inteiramente automatizado, e nem o desenvolvedor acessa o conteúdo dos seus lançamentos no dia a dia — salvo quando estritamente necessário para investigar uma falha que você tenha relatado.',
      'Você tem direito a solicitar revisão de classificação automatizada que considerar incorreta (art. 20 da LGPD). Na prática isso é mais simples do que parece: você corrige ou apaga qualquer lançamento direto no painel ou pelo chat, sem precisar pedir a ninguém.',
    ],
  },
  {
    titulo: '6. Com quem seus dados são compartilhados',
    paragrafos: [
      'Não vendemos, não alugamos e não cedemos seus dados financeiros a bancos, corretoras, fintechs, seguradoras, anunciantes, agências de crédito ou qualquer terceiro com interesse comercial. Não é uma promessa vaga: não existe no sistema nenhum caminho por onde esses dados saiam para essas finalidades.',
      'Por outro lado, o Guará é feito de serviços de terceiros, e é justo você saber exatamente quais tocam nos seus dados e para quê:',
      [
        'Meta Platforms (WhatsApp Cloud API) — entrega e recebe as mensagens. Vê o conteúdo do que trafega pelo WhatsApp, como em qualquer conversa na plataforma.',
        'Google (Gemini) — recebe o texto da mensagem, ou o áudio/foto que você enviar, para extrair os dados. No plano gratuito que usamos, o Google pode usar esse conteúdo para melhorar os produtos dele. Detalhes na seção 5.',
        'Supabase — hospeda o banco de dados, cuida do login e guarda as cópias de segurança.',
        'Oracle Cloud — fornece o servidor onde o Guará roda.',
        'Cloudflare (Turnstile) — verifica que quem cria conta é uma pessoa, e não um robô. Não recebe seus dados financeiros.',
        'DuckDNS e Let’s Encrypt — respondem pelo endereço do site e pelo certificado de segurança. Não recebem dado pessoal algum.',
      ],
      'Cada um acessa apenas o pedaço de que precisa. Nenhum recebe uma cópia completa do seu histórico financeiro.',
      'Também podemos compartilhar dados diante de ordem judicial ou requisição de autoridade competente. Nesse caso avisaremos você, salvo se a lei proibir o aviso.',
    ],
  },
  {
    titulo: '7. Transferência internacional',
    paragrafos: [
      'Todos os serviços listados acima são operados por empresas sediadas fora do Brasil, e seus dados são processados e armazenados em servidores no exterior, principalmente nos Estados Unidos.',
      'Isso é permitido pela LGPD (art. 33) quando o fornecedor oferece garantias adequadas de proteção. Os provedores que usamos mantêm cláusulas contratuais e programas de conformidade voltados ao regulamento europeu (GDPR) e à LGPD.',
      'Dizemos isso com todas as letras porque você tem o direito de saber que seus dados cruzam fronteira — e porque política que omite esse ponto está escondendo algo relevante.',
    ],
  },
  {
    titulo: '8. Por quanto tempo guardamos',
    paragrafos: [
      'Seus lançamentos ficam guardados enquanto sua conta existir. O histórico é o próprio produto: um controle financeiro que apaga o passado não serve para nada.',
      'Fazemos uma cópia de segurança por dia, mantida por 14 dias. Isso significa que, depois de você apagar um lançamento ou encerrar a conta, os dados ainda podem existir nessas cópias por até duas semanas antes de desaparecerem definitivamente. Preferimos dizer isso a fingir que a exclusão é instantânea em todos os lugares.',
      'Áudios e fotos: não são guardados em momento nenhum. Existem só na memória do servidor durante os segundos do processamento, e não entram na cópia de segurança. O que fica é o lançamento que saiu deles.',
      'Códigos de verificação são apagados assim que usados, ou expiram sozinhos em 10 minutos.',
      'Registros técnicos de erro duram pouco — o suficiente para investigar falhas — e não contêm o conteúdo das suas mensagens.',
    ],
  },
  {
    titulo: '9. Como seus dados são protegidos',
    paragrafos: [
      'Toda a comunicação acontece por conexão criptografada (HTTPS/TLS). O banco fica criptografado em repouso na infraestrutura do Supabase.',
      'Sua senha nunca passa pelo nosso código: quem cuida dela é o serviço de autenticação do Supabase, que a guarda apenas como resumo criptográfico irreversível (bcrypt). Nem nós conseguimos ler sua senha.',
      'O banco tem isolamento por linha ativado em todas as tabelas: mesmo que alguém obtenha a chave pública do aplicativo, não consegue ler dado de outra pessoa. Isso é verificado periodicamente.',
      'As mensagens recebidas do WhatsApp têm a assinatura criptográfica conferida antes de qualquer processamento, para impedir que alguém forje uma mensagem em seu nome.',
      'Nenhum sistema é imune. Se ocorrer incidente de segurança com risco relevante aos seus direitos, comunicaremos você e a Autoridade Nacional de Proteção de Dados, conforme o art. 48 da LGPD.',
    ],
  },
  {
    titulo: '10. Seus direitos, e como exercê-los',
    paragrafos: [
      'A LGPD garante um conjunto de direitos sobre seus dados. Aqui vão eles, com o caminho prático de cada um:',
      [
        'Confirmação e acesso — ver tudo que temos sobre você. O painel já mostra, e o botão "Baixar planilha" exporta em formato aberto.',
        'Correção — arrumar dado errado, pelo lápis de cada lançamento ou pedindo ao Guará no chat.',
        'Exclusão — apagar um lançamento, ou a conta inteira com tudo dentro. Pelo painel, pelo chat (escreva "quero apagar meus dados") ou por e-mail.',
        'Portabilidade — levar seus dados para outro serviço. A planilha exportada serve a esse fim.',
        'Informação sobre compartilhamento — saber com quem compartilhamos. Está na seção 6, e é a lista completa.',
        'Revogação do consentimento — como o consentimento cobre apenas o login com Google, revogá-lo significa passar a entrar por e-mail e senha, ou encerrar a conta.',
        'Oposição e revisão — se discordar de um tratamento ou de uma classificação automática, escreva. Analisamos e respondemos.',
      ],
      `Para qualquer um desses pedidos: ${EMAIL}, ou o próprio chat do Guará. Respondemos em até 15 dias corridos. Não cobramos nada, e não pedimos justificativa.`,
      'Você também pode reclamar diretamente à Autoridade Nacional de Proteção de Dados (gov.br/anpd) se entender que seus direitos não foram respeitados.',
    ],
  },
  {
    titulo: '11. Crianças e adolescentes',
    paragrafos: [
      'O Guará não se destina a menores de 16 anos e não coleta dados dessa faixa etária de forma consciente.',
      'Se soubermos que foi criada conta para alguém nessa idade sem o consentimento específico de um dos pais ou responsável legal, apagaremos os dados assim que tomarmos conhecimento. Se você é responsável e identificou isso, escreva para nós.',
    ],
  },
  {
    titulo: '12. Mudanças nesta política',
    paragrafos: [
      'Podemos atualizar este documento quando o app mudar ou quando a lei exigir. A data no topo sempre reflete a versão vigente.',
      'Se a mudança for relevante — nova finalidade de uso, novo terceiro recebendo dados, mudança na retenção — avisaremos pelo próprio WhatsApp antes de ela valer, e não depois.',
      'O histórico de versões deste documento é público: ele vive no repositório de código do projeto, onde cada alteração fica registrada com data e motivo.',
    ],
  },
];

export default function Privacidade() {
  return (
    <DocumentoLegal
      titulo="Privacidade"
      atualizado="28 de agosto de 2026"
      resumo="O que guardamos, por quê, com quem dividimos e o que você pode exigir. Sem juridiquês."
      secoes={SECOES}
      outroDocumento={{ href: '/termos', rotulo: 'Ler os Termos de Uso' }}
    />
  );
}
