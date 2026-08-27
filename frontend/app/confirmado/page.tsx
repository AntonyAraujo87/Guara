'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Turnstile from '../../components/Turnstile';

type Status = 'checking' | 'success' | 'error';

export default function Confirmado() {
  const [status, setStatus] = useState<Status>('checking');
  const [errorMsg, setErrorMsg] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNotice, setResendNotice] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashError = hash.get('error_description') || hash.get('error');

    if (hashError) {
      setStatus('error');
      setErrorMsg(
        hash.get('error_code') === 'otp_expired'
          ? 'Esse link de confirmação expirou ou já foi usado.'
          : decodeURIComponent(hashError.replace(/\+/g, ' '))
      );
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? 'success' : 'error');
      if (!data.session) setErrorMsg('Não encontramos uma confirmação válida nesse link.');
    });
  }, []);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!captchaToken) {
      setResendNotice('Aguarde a verificação de segurança terminar.');
      return;
    }
    setResendBusy(true);
    setResendNotice('');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: resendEmail,
      options: { captchaToken },
    });
    setResendBusy(false);
    setResendNotice(
      error
        ? (/captcha/i.test(error.message) ? 'A verificação de segurança falhou. Tente de novo.' : error.message)
        : 'Novo link enviado! Confira seu e-mail.'
    );
    // Token é de uso único: renova pra próxima tentativa não falhar.
    setCaptchaToken(null);
    setCaptchaReset((n) => n + 1);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--areia)] px-4 py-8">
      <div className="w-full max-w-md">
        {status === 'checking' && (
          <div className="bg-[var(--creme)] p-8 rounded-2xl border-2 border-[var(--borda)] text-center">
            <div className="h-10 w-10 mx-auto mb-4 rounded-full border-4 border-[var(--borda)] border-t-[var(--ferrugem)] animate-spin" />
            <p className="text-lg text-[var(--tinta-media)]">Confirmando seu e-mail…</p>
          </div>
        )}

        {status === 'success' && (
          <>
            <div className="bloco px-7 py-9 mb-4 text-center" style={{ backgroundColor: 'var(--verde)' }}>
              <div className="text-6xl mb-3">🎉</div>
              <h1 className="titulo text-4xl leading-none">E-mail confirmado!</h1>
              <p className="text-lg mt-4 opacity-95">
                Sua conta está pronta. Falta só vincular seu número pra os gastos começarem a cair no painel.
              </p>
            </div>
            <a
              href="/"
              className="rotulo block text-center w-full bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl hover:bg-[var(--ferrugem-escura)] transition"
            >
              Vincular meu número
            </a>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="bloco px-7 py-8 mb-4" style={{ backgroundColor: 'var(--carmim)' }}>
              <h1 className="titulo text-3xl leading-tight">Esse link não funcionou</h1>
              <p className="text-lg mt-3 opacity-95">{errorMsg} Peça outro aqui embaixo — leva um minuto.</p>
            </div>

            <form onSubmit={handleResend} className="bg-[var(--creme)] p-7 rounded-2xl border-2 border-[var(--borda)]">
              <label htmlFor="reenvio" className="block text-base font-semibold text-[var(--tinta)] mb-2">
                Seu e-mail
              </label>
              <input
                id="reenvio"
                type="email"
                required
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="voce@email.com"
                className="w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl px-4 py-3.5 mb-4 text-lg focus:outline-none focus:border-[var(--ferrugem)]"
              />
              {resendNotice && (
                <p className="text-base font-semibold text-[var(--sobre-cor)] bg-[var(--verde)] rounded-xl px-4 py-3 mb-4">
                  {resendNotice}
                </p>
              )}

              <Turnstile onToken={setCaptchaToken} resetSignal={captchaReset} />

              <button
                type="submit"
                disabled={resendBusy}
                className="rotulo w-full bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl hover:bg-[var(--ferrugem-escura)] transition disabled:opacity-60"
              >
                Reenviar confirmação
              </button>
              <a href="/" className="block text-center text-base text-[var(--tinta-media)] mt-4 underline underline-offset-2">
                Voltar para o início
              </a>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
