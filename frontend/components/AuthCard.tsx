'use client';

// A tela de entrar e criar conta.
//
// Fora do painel porque não é painel: quem vê esta tela ainda não tem dado
// nenhum carregado, e mantê-las juntas obrigava a passar pelas regras de senha
// e de captcha pra chegar no cálculo de saldo.

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Wallet } from 'lucide-react';
import Turnstile from '@/components/Turnstile';
import { GoogleIcon } from '@/components/PecasDoPainel';
import { PASSWORD_MIN_LENGTH, passwordError, traduzErroAuth } from '@/lib/painel';

export default function AuthCard() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [captchaFalhou, setCaptchaFalhou] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');

    if (mode === 'signup') {
      const pwError = passwordError(password);
      if (pwError) {
        setError(pwError);
        return;
      }
    }

    if (!captchaToken) {
      setError(
        captchaFalhou
          ? 'A verificação de segurança não carregou. Verifique sua conexão e atualize a página.'
          : 'Aguarde a verificação de segurança terminar — leva um segundo.'
      );
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken },
        });
        if (error) setError(traduzErroAuth(error.message));
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            captchaToken,
            emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/confirmado` : undefined,
          },
        });
        if (error) setError(traduzErroAuth(error.message));
        else if (!data.session) setNotice('Conta criada! Confira seu e-mail pra confirmar o cadastro.');
      }
    } finally {
      setBusy(false);
      // O token é de uso único — sem renovar, a próxima tentativa falharia sempre.
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    }
  }

  async function handleGoogle() {
    setError('');
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--areia)] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bloco px-7 py-8 mb-4" style={{ backgroundColor: 'var(--ferrugem)' }}>
          <Wallet
            size={150}
            strokeWidth={1}
            aria-hidden="true"
            className="absolute -right-10 -top-8 opacity-[0.13] pointer-events-none"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- static local asset, no benefit from next/image here */}
          <img src="/logo.png" alt="" className="w-14 h-14 rounded-xl mb-4 relative" />
          <h1 className="titulo text-5xl leading-none">Guará</h1>
          <p className="text-lg mt-3 opacity-95">
            Você conta seus gastos no WhatsApp. Eu organizo tudo aqui.
          </p>
        </div>

        <div className="bg-[var(--creme)] p-7 sm:p-8 rounded-2xl border-2 border-[var(--borda)]">
          <h2 className="titulo text-2xl text-[var(--tinta)] mb-5">
            {mode === 'signin' ? 'Entrar na sua conta' : 'Criar sua conta'}
          </h2>

          <button
            type="button"
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-2.5 border-2 border-[var(--borda-forte)] bg-[var(--creme)] rounded-xl py-3.5 text-lg font-semibold text-[var(--tinta)] hover:bg-[var(--areia)] transition mb-5"
          >
            <GoogleIcon /> Continuar com Google
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-0.5 bg-[var(--borda)]" />
            <span className="rotulo text-xs text-[var(--tinta-fraca)]">ou com e-mail</span>
            <div className="flex-1 h-0.5 bg-[var(--borda)]" />
          </div>

          <form onSubmit={handleSubmit}>
            <label htmlFor="email" className="block text-base font-semibold text-[var(--tinta)] mb-2">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              className="w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl px-4 py-3.5 mb-4 text-lg focus:outline-none focus:border-[var(--ferrugem)]"
            />
            <label htmlFor="senha" className="block text-base font-semibold text-[var(--tinta)] mb-2">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              required
              minLength={mode === 'signup' ? PASSWORD_MIN_LENGTH : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl px-4 py-3.5 mb-2 text-lg focus:outline-none focus:border-[var(--ferrugem)]"
            />
            {mode === 'signup' && (
              <p className="text-sm text-[var(--tinta-media)] mb-4 leading-relaxed">
                Pelo menos 8 caracteres, com 1 número e 1 símbolo. Exemplo: <strong>Guara2026!</strong>
              </p>
            )}
            {error && (
              <p className="text-base font-semibold text-[var(--sobre-cor)] bg-[var(--carmim)] rounded-xl px-4 py-3 mb-4">
                {error}
              </p>
            )}
            {notice && (
              <p className="text-base font-semibold text-[var(--sobre-cor)] bg-[var(--verde)] rounded-xl px-4 py-3 mb-4">
                {notice}
              </p>
            )}

            <Turnstile onToken={setCaptchaToken} onFalha={setCaptchaFalhou} resetSignal={captchaReset} />

            <button
              type="submit"
              disabled={busy}
              className="rotulo w-full bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl hover:bg-[var(--ferrugem-escura)] transition disabled:opacity-60 mt-2"
            >
              {mode === 'signin' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>

          <p className="text-base text-[var(--tinta-media)] mt-6 text-center">
            {mode === 'signin' ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice(''); }}
              className="text-[var(--ferrugem)] font-bold underline underline-offset-2"
            >
              {mode === 'signin' ? 'Criar conta' : 'Entrar'}
            </button>
          </p>

          {/* Aparece antes de criar a conta, não depois: é quando a informação
              ainda pode mudar a decisão de alguém. */}
          <p className="text-sm text-[var(--tinta-fraca)] mt-6 text-center leading-relaxed">
            Ao criar conta você aceita os{' '}
            <Link href="/termos" className="underline underline-offset-2 text-[var(--tinta-media)]">
              Termos de Uso
            </Link>{' '}
            e a{' '}
            <Link href="/privacidade" className="underline underline-offset-2 text-[var(--tinta-media)]">
              Política de Privacidade
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
