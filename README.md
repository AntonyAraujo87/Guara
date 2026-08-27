# Guará 🐺

Controle financeiro pessoal por WhatsApp. Você conta seus gastos numa conversa,
e o Guará organiza tudo num painel web.

**Painel:** https://168-138-141-214.sslip.io
**WhatsApp:** +55 51 8056-2381

## Como funciona

```
WhatsApp → webhook → Gemini extrai a INTENÇÃO → backend calcula a RESPOSTA → Supabase
```

A IA nunca inventa número: ela só classifica a frase ("isso é uma pergunta sobre
gastos do mês"). O valor vem sempre do banco. Num app de dinheiro, alucinação de
saldo seria inaceitável.

## O que ele entende

| Você diz | Ele faz |
|---|---|
| `paguei 30 no mercado` | registra a saída |
| `tenho 1500 no banco` | registra como saldo inicial |
| `quanto gastei esse mês?` | consulta e responde com o valor real |
| `comprei uma TV em 6x de 200` | cria 6 parcelas, uma por mês de vencimento |
| `guardei 100 no cofrinho da viagem` | separa num cofrinho nomeado |
| `todo mês pago 50 de Netflix` | lança sozinho no dia certo |
| `na verdade é dia 5` | corrige o último recorrente |
| `apaga o último` | desfaz o registro mais recente |

## Estrutura

```
backend/     Node + Express. Webhook, intenções e acesso ao banco
frontend/    Next.js. Painel, gráficos e edição
deploy/      Compose, Caddy, backup, monitor e migrações
```

## Publicar

As imagens são compiladas no GitHub Actions — **não na VM**. Compilar lá derrubava
o site: a máquina tem 952 MB e o build tomava tudo, fazendo as respostas irem de
0,2s para 19s durante 10 minutos.

```bash
git push            # dispara a compilação
bash deploy/publicar.sh   # na VM: baixa e troca (~1 min)
```

Emergência, se o registro estiver fora:
```bash
docker compose -f deploy/docker-compose.local.yml up -d --build
```

## Segredos

Nada de credencial neste repositório. Tudo vive em `deploy/.env` na VM e nas
configurações do Supabase — e o `.gitignore` cobre `.env`, `*.pem` e `*.key`.

As chaves que aparecem no código são públicas por natureza: a *anon key* do
Supabase e a *site key* do Turnstile já ficam visíveis no HTML para qualquer
visitante.
