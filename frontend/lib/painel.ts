// Ajudantes do painel: mês, moeda, validação, e a chamada autenticada.
//
// São as funções que várias telas precisam e nenhuma delas é dona. Ficavam no
// meio do page.tsx, o que obrigava a abrir um arquivo de duas mil linhas pra
// mudar a mensagem de erro de uma senha.

import { supabase } from '@/lib/supabaseClient';

export // Categorias que vêm de fábrica — as do banco são as que a pessoa criar.
const CATEGORIAS_PADRAO = {
  despesa: ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Compras', 'Outros'],
  receita: ['Salário', 'Freelance', 'Investimentos', 'Presente/Reembolso', 'Outros'],
};

export // O mesmo nome que o backend usa (backend/db-service.js). Quem nunca criou
// uma segunda carteira tem só esta, e o painel se comporta como sempre.
const CARTEIRA_PADRAO = 'Pessoal';

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export // Deslocamento em meses a partir do mês atual: 0 = agora, -1 = mês passado, +1 = próximo.
function mesPorDeslocamento(offset: number) {
  const hoje = new Date();
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() };
}

export function chaveDoMes({ ano, mes }: { ano: number; mes: number }) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
}

export const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const PASSWORD_MIN_LENGTH = 8;

export function passwordError(password: string): string {
  if (password.length < PASSWORD_MIN_LENGTH) return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (!/\d/.test(password)) return 'A senha precisa ter pelo menos 1 número.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'A senha precisa ter pelo menos 1 símbolo (ex: ! @ # $ % *).';
  return '';
}

export // Mensagens do Supabase vêm em inglês. Quem usa o app não tem que decifrar isso.
function traduzErroAuth(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('captcha')) return 'A verificação de segurança falhou. Tente de novo.';
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar. Veja sua caixa de entrada (e o spam).';
  if (m.includes('user already registered')) return 'Esse e-mail já tem conta. Tente entrar.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas seguidas. Espere um minutinho.';
  if (m.includes('password')) return 'Senha inválida: use 8 caracteres, com 1 número e 1 símbolo.';
  return msg;
}

export // Formato que a Meta manda no webhook pra números brasileiros: DDI(55) + DDD(2) + número(8), SEM o 9 extra do celular.
const BR_PHONE_REGEX = /^55\d{10}$/;

export // POST autenticado no backend. Fica no escopo do módulo porque duas telas
// diferentes precisam: a de vincular número e a caixa de conversa do painel.
async function authedFetch(path: string, body: object) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

// As classes dos campos de formulário. Compartilhadas porque três telas usam
// as mesmas, e "mesmo visual" só continua verdade enquanto for o mesmo texto.

export const campoClasse =
  'w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl px-4 py-3.5 text-lg focus:outline-none focus:border-[var(--ferrugem)]';

export const rotuloClasse = 'block text-base font-semibold text-[var(--tinta)] mb-2';

export const botaoClasse =
  'rotulo w-full bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl hover:bg-[var(--ferrugem-escura)] transition mt-2';
