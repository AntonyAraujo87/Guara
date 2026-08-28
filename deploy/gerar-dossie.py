# -*- coding: utf-8 -*-
"""Monta o dossie do Guara em PDF.

Fontes do Windows registradas de proposito: as embutidas do reportlab nao tem
acento decente nem peso variado, e um documento em portugues sem acento
correto parece rascunho.
"""
import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, PageBreak,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)

SAIDA = r'C:\Tudão\Claude\controle-financeiro\Guara-Dossie.pdf'

# ── identidade ──────────────────────────────────────────────────────────
FERRUGEM = colors.HexColor('#C4400D')
TINTA = colors.HexColor('#191007')
TINTA_MEDIA = colors.HexColor('#5C4A36')
AREIA = colors.HexColor('#EFE3D2')
CREME = colors.HexColor('#FFFBF4')
BORDA = colors.HexColor('#DDCDB6')
VERDE = colors.HexColor('#2F6B4F')
CARMIM = colors.HexColor('#A32B2B')

for nome, arquivo in [('Corpo', 'segoeui.ttf'), ('Corpo-N', 'segoeuib.ttf'),
                      ('Titulo', 'georgiab.ttf'), ('Titulo-R', 'georgia.ttf')]:
    pdfmetrics.registerFont(TTFont(nome, 'C:/Windows/Fonts/' + arquivo))

E = dict(fontName='Corpo', fontSize=10, leading=15, textColor=TINTA_MEDIA)

S = {
    'h1': ParagraphStyle('h1', fontName='Titulo', fontSize=19, leading=23,
                         textColor=FERRUGEM, spaceBefore=2, spaceAfter=9),
    'h2': ParagraphStyle('h2', fontName='Corpo-N', fontSize=12, leading=16,
                         textColor=TINTA, spaceBefore=13, spaceAfter=5,
                         keepWithNext=1),
    'p': ParagraphStyle('p', alignment=TA_JUSTIFY, spaceAfter=7, **E),
    'li': ParagraphStyle('li', leftIndent=11, bulletIndent=2, spaceAfter=4, **E),
    'nota': ParagraphStyle('nota', fontName='Corpo', fontSize=9, leading=13,
                           textColor=TINTA_MEDIA, leftIndent=9, spaceAfter=7,
                           borderPadding=(0, 0, 0, 7)),
    'cap-t': ParagraphStyle('cap-t', fontName='Titulo', fontSize=42, leading=46,
                            textColor=CREME, alignment=TA_CENTER),
    'cap-s': ParagraphStyle('cap-s', fontName='Corpo', fontSize=13, leading=19,
                            textColor=CREME, alignment=TA_CENTER),
    'cap-d': ParagraphStyle('cap-d', fontName='Corpo', fontSize=9, leading=13,
                            textColor=CREME, alignment=TA_CENTER),
    'cel': ParagraphStyle('cel', fontName='Corpo', fontSize=9, leading=12.5, textColor=TINTA_MEDIA),
    'cel-n': ParagraphStyle('cel-n', fontName='Corpo-N', fontSize=9, leading=12.5, textColor=TINTA),
}


def P(t, e='p'):
    return Paragraph(t, S[e])


def LI(itens):
    return [Paragraph(t, S['li'], bulletText='\u2022') for t in itens]


def tabela(linhas, larguras, cabecalho=True):
    dados = [[Paragraph(c, S['cel-n' if (cabecalho and i == 0) else 'cel']) for c in linha]
             for i, linha in enumerate(linhas)]
    # repeatRows: tabela que atravessa a pagina leva o cabecalho junto. Sem
    # isso, a segunda metade vira uma lista de celulas sem dizer do que sao.
    t = Table(dados, colWidths=larguras, hAlign='LEFT', repeatRows=1 if cabecalho else 0)
    estilo = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, BORDA),
    ]
    if cabecalho:
        estilo += [('BACKGROUND', (0, 0), (-1, 0), AREIA),
                   ('LINEBELOW', (0, 0), (-1, 0), 0.9, FERRUGEM)]
    t.setStyle(TableStyle(estilo))
    return t


def destaque(titulo, texto, cor=FERRUGEM):
    """Caixa para o que o leitor nao pode deixar de ler."""
    interno = [Paragraph(titulo, S['cel-n']), Spacer(1, 3), Paragraph(texto, S['cel'])]
    t = Table([[interno]], colWidths=[165 * mm], hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CREME),
        ('LINEBEFORE', (0, 0), (0, -1), 2.5, cor),
        ('LEFTPADDING', (0, 0), (-1, -1), 11),
        ('RIGHTPADDING', (0, 0), (-1, -1), 11),
        ('TOPPADDING', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
    ]))
    return t


# ── paginas ─────────────────────────────────────────────────────────────
def capa(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(FERRUGEM)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.restoreState()


def miolo(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(AREIA)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setFillColor(CREME)
    canvas.roundRect(13 * mm, 13 * mm, A4[0] - 26 * mm, A4[1] - 26 * mm, 5, fill=1, stroke=0)
    canvas.setFont('Corpo', 8)
    canvas.setFillColor(TINTA_MEDIA)
    canvas.drawString(20 * mm, 17 * mm, 'Guará — dossiê do projeto')
    canvas.drawRightString(A4[0] - 20 * mm, 17 * mm, str(canvas.getPageNumber() - 1))
    canvas.restoreState()


doc = BaseDocTemplate(SAIDA, pagesize=A4,
                      leftMargin=22 * mm, rightMargin=22 * mm,
                      topMargin=24 * mm, bottomMargin=24 * mm,
                      title='Guará — dossiê do projeto',
                      author='Antony Cassio Bandeira Araujo')

quadro_capa = Frame(22 * mm, 60 * mm, A4[0] - 44 * mm, A4[1] - 150 * mm, id='capa')
quadro = Frame(22 * mm, 24 * mm, A4[0] - 44 * mm, A4[1] - 48 * mm, id='miolo')
doc.addPageTemplates([
    PageTemplate(id='capa', frames=[quadro_capa], onPage=capa),
    PageTemplate(id='miolo', frames=[quadro], onPage=miolo),
])

h = []

# ══ CAPA ════════════════════════════════════════════════════════════════
h += [
    Spacer(1, 40 * mm),
    P('Guará', 'cap-t'),
    Spacer(1, 7),
    P('Controle financeiro que mora no WhatsApp', 'cap-s'),
    Spacer(1, 26),
    P('Do primeiro commit à auditoria de segurança<br/>'
      '25 a 28 de agosto de 2026 &nbsp;·&nbsp; 76 commits &nbsp;·&nbsp; custo mensal: R$ 0,00', 'cap-d'),
    PageBreak(),
]

# ══ 1 ═══════════════════════════════════════════════════════════════════
h += [
    P('1. O que é o Guará'),
    P('O Guará é um assistente financeiro que funciona por mensagem. A pessoa conta um gasto do jeito '
      'que falaria com alguém — <i>"paguei 30 no mercado"</i> — e ele organiza. Sem planilha, sem app '
      'para baixar, sem cadastro obrigatório.'),
    P('A aposta do projeto é uma só: <b>o app financeiro que a pessoa usa é aquele que ela não precisa '
      'abrir.</b> Todo mundo já tem o WhatsApp aberto o dia inteiro. Registrar um gasto ali custa cinco '
      'segundos; abrir um aplicativo, escolher categoria e digitar valor custa dois minutos — e é por '
      'isso que quase ninguém mantém o hábito.'),

    P('As três decisões que sustentam tudo', 'h2'),
    P('<b>1. A IA só entende; ela nunca calcula.</b> O modelo lê a frase e devolve campos: valor, tipo, '
      'categoria. Todo número que a pessoa vê — saldo, total do mês, quanto falta para a meta — é calculado '
      'pelo sistema a partir do banco. Modelo de linguagem erra conta com confiança, e num app de dinheiro '
      'isso seria inaceitável.'),
    P('<b>2. Conta é opcional, para sempre.</b> O Guará funciona só pelo WhatsApp. A conta no painel '
      'destrava gráficos e edição com o dedo, mas nunca é exigida. Pedir cadastro antes de entregar valor '
      'é a forma mais eficiente de perder alguém.'),
    P('<b>3. Tudo gratuito, por escolha e não por limitação.</b> Cada peça foi escolhida no plano gratuito '
      'permanente, não em trial. O projeto não tem prazo de validade escondido.'),

    Spacer(1, 5),
    destaque('Em números, hoje',
             '9.049 linhas de código &nbsp;·&nbsp; 27 intenções compreendidas &nbsp;·&nbsp; 10 tabelas '
             '&nbsp;·&nbsp; 8 migrações &nbsp;·&nbsp; 8 scripts de operação &nbsp;·&nbsp; '
             '3 camadas de monitoramento &nbsp;·&nbsp; R$ 0,00 por mês'),
    PageBreak(),
]

# ══ 2 ═══════════════════════════════════════════════════════════════════
h += [
    P('2. Como chegou até aqui'),
    P('Quatro dias, 76 commits. A ordem importa: cada bloco só existiu porque o anterior expôs uma falta.'),
    Spacer(1, 4),
    tabela([
        ['Etapa', 'O que foi feito', 'O que motivou'],
        ['Fundação', 'Bot no WhatsApp, banco no Supabase, painel em Next.js, VM na Oracle',
         'Registrar um gasto falando'],
        ['Deploy', 'Imagens montadas no GitHub, VM só baixa',
         'Publicar deixava o site inutilizável por 10 minutos'],
        ['Incidente', 'Trava de lint no CI',
         'Um hook depois de <i>return</i> derrubou o painel por um dia — e o servidor '
         'respondia 200 o tempo todo'],
        ['Confiabilidade', 'Backup diário em dois lugares, três monitores, alerta por WhatsApp',
         'Ninguém sabia quando o Guará caía'],
        ['Jurídico', 'Política de privacidade e termos, LGPD, exclusão pelo chat',
         'O app tratava dado pessoal sem dizer o quê'],
        ['Compreensão', 'Referência, gíria, data, valor por extenso, mensagem composta',
         'Frases reais de gente com pressa não eram entendidas'],
        ['Multimídia', 'Áudio transcrito e foto de comprovante lida',
         'Muita gente prefere falar a digitar'],
        ['Carteiras', 'Separar dinheiro pessoal do de trabalho, sem pedir CPF nem CNPJ',
         'Ideia de um usuário: autônomo mistura os dois'],
        ['Paridade', 'O painel passou a fazer tudo que o WhatsApp faz, e vice-versa',
         'O painel só sabia criar categoria'],
        ['Auditoria', 'Ataque real ao próprio sistema, refatoração, restauração testada',
         'Chegou a hora de tentar quebrar de propósito'],
    ], [26 * mm, 62 * mm, 78 * mm]),
    PageBreak(),
]

# ══ 3 ═══════════════════════════════════════════════════════════════════
h += [
    P('3. Arquitetura'),
    P('Nada aqui é trial. Todas as peças são de plano gratuito permanente, e a conta fecha em zero.'),
    Spacer(1, 4),
    tabela([
        ['Peça', 'Serviço', 'Papel', 'Limite'],
        ['Mensagens', 'Meta WhatsApp Cloud API', 'Receber e responder', '1.000 conversas/mês'],
        ['Compreensão', 'Google Gemini', 'Texto, áudio e imagem viram campos', 'Cota diária por modelo'],
        ['Banco', 'Supabase (Postgres)', 'Dados, login, arquivos', '500 MB'],
        ['Servidor', 'Oracle Cloud, VM ARM', 'Backend e painel', 'Sempre gratuito'],
        ['Entrada', 'Caddy', 'HTTPS, proxy, página de espera', '—'],
        ['Certificado', "Let's Encrypt", 'TLS 1.3, renovação automática', '—'],
        ['Endereço', 'DuckDNS', 'guarapp.duckdns.org', '—'],
        ['Anti-robô', 'Cloudflare Turnstile', 'Captcha no cadastro', '—'],
        ['Publicação', 'GitHub Actions + GHCR', 'Monta a imagem e guarda', '2.000 min/mês'],
        ['Vigilância', 'UptimeRobot', 'Checa de fora a cada 5 min', '50 monitores'],
    ], [24 * mm, 44 * mm, 62 * mm, 36 * mm]),

    P('Por que a VM só baixa imagem pronta', 'h2'),
    P('Montar o projeto dentro da VM consumia toda a memória dela e o site ficava sem responder por cerca '
      'de dez minutos a cada publicação. Hoje o GitHub monta, a VM baixa e troca o contêiner: a publicação '
      'leva por volta de vinte segundos, e o Caddy cobre a troca com uma página de espera.'),

    P('Onde cada decisão de segurança mora', 'h2'),
    *LI([
        '<b>No banco.</b> Cada tabela tem política que amarra a linha ao telefone do dono. Não é '
        'verificação da aplicação: mesmo com a chave pública que qualquer um extrai do navegador, o banco '
        'devolve zero linhas.',
        '<b>No servidor.</b> Assinatura do webhook conferida por HMAC, limite de requisições, cabeçalhos '
        'de segurança, tamanho máximo de corpo.',
        '<b>Na fronteira com a IA.</b> Texto limpo de caracteres invisíveis, limitado a mil caracteres, '
        'e entregue dentro de delimitadores explícitos que separam o que é dado do que é instrução.',
    ]),
    PageBreak(),
]

# ══ 4 ═══════════════════════════════════════════════════════════════════
h += [
    P('4. O que ele faz'),
    P('Vinte e sete intenções compreendidas. Tudo que existe no WhatsApp existe no painel, e o contrário '
      'também — não por disciplina, mas porque as duas pontas chamam exatamente a mesma função.'),
    Spacer(1, 4),
    tabela([
        ['Registrar', '<i>"paguei 30 no mercado"</i>, <i>"caiu 3000"</i>, <i>"guardei 200"</i>, '
                      '<i>"devo 50 pro João"</i>, <i>"TV em 6x de 200"</i>, <i>"todo mês 50 de Netflix"</i>'],
        ['Perguntar', '<i>"quanto gastei esse mês"</i>, <i>"qual meu saldo"</i>, <i>"quanto gastei em '
                      'junho"</i>, <i>"pra onde foi meu dinheiro"</i>, <i>"quais minhas parcelas"</i>'],
        ['Corrigir', '<i>"aquele mercado era 45"</i>, <i>"esse aí era lanche"</i>, <i>"apaga o gasto do '
                     'mercado"</i>, <i>"cancela a Netflix"</i>, <i>"não paguei aquela parcela"</i>'],
        ['Reclassificar', '<i>"está parcelado"</i> → ele pergunta em quantas vezes; <i>"6x"</i> resolve. '
                          '<i>"isso é todo mês"</i> vira conta mensal'],
        ['Carteiras', '<i>"cria uma carteira da empresa"</i>, <i>"gastei 200 na empresa"</i>, '
                      '<i>"nessa mesma carteira gastei 50"</i>, <i>"esse foi do pessoal"</i>'],
        ['Metas', '<i>"quero juntar 5 mil até novembro"</i>, <i>"quanto preciso guardar por mês"</i>'],
        ['Áudio e foto', 'Grava um áudio contando o gasto, ou manda a foto do comprovante'],
        ['Levar embora', '<i>"me manda a planilha"</i>, <i>"quero apagar meus dados"</i>'],
    ], [30 * mm, 136 * mm], cabecalho=False),

    P('O que faz a compreensão funcionar', 'h2'),
    P('Não é o tamanho do dicionário. São três regras que resolvem famílias inteiras de frase:'),
    *LI([
        '<b>Triagem antes da escolha.</b> Antes de decidir <i>qual</i> intenção, o sistema decide <i>o '
        'que a pessoa está fazendo</i>: contando um fato, perguntando, corrigindo, respondendo, ou '
        'conversando. Sem isso o modelo escolhia pela palavra que aparecia — e <i>"gastei 1500 em '
        'junho"</i> virava consulta de junho.',
        '<b>Quem tem o número decide.</b> Se a pessoa disse o valor, é registro. Se ela quer o valor de '
        'volta, é pergunta. É o que separa <i>"gastei 1500 em junho"</i> de <i>"quanto gastei em junho"</i>.',
        '<b>Palavra de referência manda mais que tudo.</b> <i>"Esse"</i>, <i>"essa"</i>, <i>"isso"</i> '
        'significam que a frase é sobre algo que já existe — mesmo trazendo um valor. O valor ali diz '
        '<i>qual</i>, não cria outro. Sem essa regra, corrigir duplicava o gasto.',
    ]),
    P('E o Guará sabe que dia é hoje. Parece pequeno: sem isso, <i>"na quarta"</i>, <i>"no domingo"</i> e '
      '<i>"dia 15"</i> eram chute — e chute em data entra no mês errado sem ninguém perceber.', 'p'),
    PageBreak(),
]

# ══ 5 ═══════════════════════════════════════════════════════════════════
h += [
    P('5. O que acontece quando algo dá errado'),
    P('Esta é a parte que separa um projeto de fim de semana de um sistema. Cada item abaixo existe por '
      'causa de uma falha que aconteceu de verdade.'),
    Spacer(1, 4),
    tabela([
        ['Quando', 'O que acontece'],
        ['A IA está sobrecarregada',
         'Cai para um segundo modelo, que tem fila e cota próprias'],
        ['A cota do dia acabou',
         'Um leitor sem IA nenhuma assume e continua anotando <i>"paguei 30 no mercado"</i>. Ele desiste '
         'de propósito do que leria errado — dívida, parcelamento, pergunta — porque um gasto perdido a '
         'pessoa remanda, e um gasto inventado ela não descobre'],
        ['A cota acabou e insistir é inútil',
         'Um disjuntor desliga o modelo até a virada da cota. A primeira mensagem descobre em 1,3 s; as '
         'seguintes respondem instantaneamente'],
        ['Chega áudio, foto, figurinha ou contato',
         'Áudio e foto viram texto. Os outros formatos recebem resposta educada, nunca silêncio'],
        ['A mesma mensagem chega duas vezes',
         'Reconhecida pelo identificador e ignorada'],
        ['O painel cai',
         'Três monitores independentes: cron na VM a cada 10 min, UptimeRobot de fora a cada 5 min, e um '
         'navegador real que falha se a página não montar'],
        ['A VM se perde',
         'Backup diário em dois lugares, e restauração testada de verdade: sete registros apagados e '
         'devolvidos idênticos'],
        ['Uma credencial vai vencer',
         'Aviso semanal por WhatsApp a 30, 14, 7, 3 e 1 dia'],
    ], [42 * mm, 124 * mm]),

    Spacer(1, 6),
    destaque('A lição mais cara do projeto',
             'Em 27/08 o painel ficou quebrado por mais de um dia. O servidor respondia 200 o tempo todo — '
             'a página chegava e morria no navegador. Todo monitor baseado em código de status dizia que '
             'estava tudo bem. Hoje os três monitores conferem o <i>conteúdo</i>, e um deles abre um '
             'navegador de verdade.', CARMIM),
    PageBreak(),
]

# ══ 6 ═══════════════════════════════════════════════════════════════════
h += [
    P('6. Auditoria de segurança'),
    P('Tudo abaixo foi testado atacando o sistema, não lendo o código.'),
    Spacer(1, 4),
    tabela([
        ['Teste', 'Resultado'],
        ['Segredo no histórico do Git', '76 commits varridos, nenhum'],
        ['Leitura sem login', '10 tabelas, zero linhas devolvidas'],
        ['Escrita e exclusão sem login', 'Recusadas pelo banco'],
        ['Um usuário logado atacando outro',
         '10 tentativas, nenhuma passou: ler, alterar, apagar, plantar lançamento, sequestrar número, '
         'ler código de verificação, injetar telefone na API'],
        ['Cabeçalhos de segurança', '7 de 7 presentes'],
        ['HTTPS', 'Redirecionamento forçado, TLS 1.3, HSTS de um ano'],
        ['Limite de requisições', 'Medido: 20/min no painel, 30/min no webhook'],
        ['Corpo gigante', '3 MB recusados antes de processar'],
        ['SQL concatenado', 'Nenhum: tudo via construtor de consulta'],
        ['Dependências vulneráveis', 'Zero, backend e painel'],
        ['Serviço exposto sem necessidade', 'rpcbind desligado'],
    ], [56 * mm, 110 * mm]),

    P('Dois bugs sérios encontrados e corrigidos', 'h2'),
    P('<b>Renomear carteira podia esconder dinheiro.</b> A operação percorria seis tabelas e só depois '
      'atualizava a lista. Falhando na quarta, metade ficava com o nome novo e a lista com o antigo — e o '
      'dinheiro renomeado sumia da tela, num nome que não existia mais em lugar nenhum. Criar e apagar '
      'tinham o irmão do problema: liam a lista, mexiam e gravavam de volta, então o painel e o WhatsApp '
      'ao mesmo tempo se sobrescreviam. As três operações foram movidas para dentro do Postgres, onde cada '
      'uma roda numa transação e uma trava transforma corrida em fila.'),
    P('<b>O backup nunca tinha sido restaurado.</b> Rodava todos os dias desde o começo do projeto, '
      'gravava em dois lugares, e ninguém sabia se voltava. Backup que ninguém restaurou é esperança, não '
      'plano. Agora existe procedimento, com modo de conferência por padrão, e ele foi testado apagando '
      'dados de verdade.'),
    PageBreak(),
]

# ══ 7 ═══════════════════════════════════════════════════════════════════
h += [
    P('7. O que ainda não está pronto'),
    P('Um relatório que só lista acertos não serve para decidir nada.'),
    Spacer(1, 4),

    destaque('Precisa de ação, com data',
             'O token da Meta <b>vence em 25/10/2026</b>. No dia em que vencer, o WhatsApp para inteiro — '
             'e nenhum monitor pega, porque o site continua de pé. Existe alarme semanal, mas alarme é '
             'remendo: a solução é gerar um token permanente de usuário do sistema no Business Manager, '
             'com expiração "Nunca". Leva alguns minutos e resolve para sempre.', CARMIM),
    Spacer(1, 8),

    tabela([
        ['Limite conhecido', 'Consequência'],
        ['Login com Google preso em modo de teste',
         'Publicar exige domínio próprio (cerca de R$ 40 por ano). Só o dono e convidados usam esse login; '
         'e-mail e senha funcionam para todos'],
        ['Endereço do Supabase aparece na tela do Google',
         'Escondê-lo custa US$ 10 por mês. O nome do app já foi ajustado, o que resolve a maior parte da '
         'impressão'],
        ['O painel ainda tem um arquivo de 2.843 linhas',
         'O backend já foi dividido; o painel é o próximo'],
        ['Ninguém além do dono passou pelo cadastro',
         'O caminho de entrada de um estranho nunca foi observado de fora'],
        ['Cota diária da IA é finita',
         'Testes intensos já a esgotaram uma vez, e o app ficou degradado por uma hora. O leitor sem IA '
         'cobre o essencial, mas frases complexas ficam de fora'],
    ], [62 * mm, 104 * mm]),
    PageBreak(),
]

# ══ 8 ═══════════════════════════════════════════════════════════════════
h += [
    P('8. Próximos passos'),

    P('Agora', 'h2'),
    *LI([
        '<b>Token permanente da Meta.</b> É o único item com data marcada.',
        '<b>Terminar a divisão do painel.</b> O arquivo de 2.843 linhas é onde o próximo bug vai se '
        'esconder.',
        '<b>Observar alguém de fora usar.</b> Uma pessoa que nunca viu o Guará, do primeiro "oi" ao '
        'primeiro gasto. É o teste que nenhuma auditoria substitui.',
    ]),

    P('As três funcionalidades de maior impacto que faltam', 'h2'),

    P('<b>1. Relatório mensal que chega sozinho.</b> Hoje o Guará responde quando perguntado. Um resumo '
      'no primeiro dia do mês — o que entrou, o que saiu, a maior mudança em relação ao mês anterior, e '
      'como está a meta — transforma um caderno em conselheiro. O trabalho já está quase todo feito: os '
      'cálculos existem, o disparo agendado existe, falta o texto e o gatilho. É o melhor retorno por '
      'esforço do projeto inteiro.'),

    P('<b>2. Avisar antes, não depois.</b> O sistema sabe quais parcelas vencem, quais contas mensais '
      'caem em que dia, e quanto costuma sobrar. Com isso dá para dizer <i>"esse mês tem 3 parcelas caindo '
      'e o aluguel; no seu ritmo, o dinheiro acaba dia 22"</i>. Isso muda o produto de categoria: de '
      'registro para prevenção. E não precisa de nenhuma peça nova — só de olhar para a frente em vez de '
      'para trás.'),

    P('<b>3. Categoria que aprende com a pessoa.</b> Hoje a categoria vem da IA a cada mensagem. Se '
      'alguém corrige <i>"aquele mercado era lazer"</i> três vezes, o Guará deveria lembrar. Guardar as '
      'correções e usá-las como preferência custa uma tabela pequena, elimina a fricção mais repetida do '
      'uso diário, e melhora sozinho com o tempo.'),

    Spacer(1, 5),
    destaque('Se fosse para escolher só uma',
             'O relatório mensal. É o que faz alguém lembrar que o Guará existe sem precisar abrir nada — '
             'e um app de finanças que ninguém abre por duas semanas é um app que já foi desinstalado, '
             'mesmo que ninguém tenha apertado o botão.'),
    PageBreak(),
]

# ══ 9 ═══════════════════════════════════════════════════════════════════
h += [
    P('9. Operação no dia a dia'),
    P('Tudo que se faz com o Guará em produção, num lugar só.'),
    Spacer(1, 4),
    tabela([
        ['Situação', 'O que fazer'],
        ['Publicar uma mudança',
         'Enviar para a branch principal. O GitHub monta a imagem; na VM, <font face="Corpo-N">bash '
         'deploy/publicar.sh</font>'],
        ['Ver se está de pé',
         'O painel responde em guarapp.duckdns.org. Se cair três vezes seguidas, chega alerta no WhatsApp'],
        ['Restaurar do backup',
         '<font face="Corpo-N">./restaurar.sh AAAA-MM-DD</font> mostra o que faria; com '
         '<font face="Corpo-N">--aplicar</font> executa'],
        ['Mudar de endereço',
         '<font face="Corpo-N">deploy/trocar-endereco.sh</font>. São QUATRO painéis externos, não três: '
         'Supabase, Turnstile, Google e — o que já foi esquecido uma vez — o webhook da Meta'],
        ['Alterar o banco',
         'Arquivo novo em <font face="Corpo-N">deploy/</font>, colado no editor SQL do Supabase. Todas as '
         'migrações são reexecutáveis sem efeito colateral'],
        ['Depois de mexer no backend',
         '<font face="Corpo-N">node verificar-modulos.js</font>. Conferir só a sintaxe não basta: um '
         'export apontando para função apagada passa no <font face="Corpo-N">node --check</font> e derruba '
         'o servidor ao subir'],
    ], [42 * mm, 124 * mm]),

    P('Duas coisas que este projeto ensinou', 'h2'),
    P('<b>Medir antes de teorizar.</b> Duas vezes num mesmo dia o diagnóstico saiu por dedução e custou '
      'horas. Nas duas, a resposta apareceu em minutos assim que alguém olhou de verdade — uma no console '
      'do navegador, outra reproduzindo o monitor localmente.'),
    P('<b>O que não é testado não funciona.</b> O backup rodava havia dias e nunca tinha voltado. A '
      'verificação de módulos só existe porque um deploy quebrou em produção. Em todos os casos, o custo '
      'de descobrir tarde foi muito maior que o de testar cedo.'),
]

doc.build(h)
print('  gerado: %s (%.0f KB)' % (SAIDA, os.path.getsize(SAIDA) / 1024))
