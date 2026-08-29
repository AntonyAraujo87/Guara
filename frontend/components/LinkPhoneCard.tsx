'use client';

// Ligar o número de WhatsApp à conta.
//
// O passo em que a pessoa está (telefone ou código) fica no sessionStorage: um
// F5 no meio do processo não pode fazer voltar à estaca zero, porque o código
// já foi enviado e só vale uma vez.

import { useState } from 'react';
import { PassoLista } from '@/components/PecasDoPainel';
import { BR_PHONE_REGEX, authedFetch } from '@/lib/painel';

// Chave do sessionStorage. Constante nomeada porque a mesma string é lida,
// escrita e apagada em três lugares deste arquivo.
const LINK_PHONE_STORAGE_KEY = 'guara_link_phone_state';

function loadLinkPhoneState(): { step: 'phone' | 'code'; inputPhone: string } {
  if (typeof window === 'undefined') return { step: 'phone', inputPhone: '' };
  try {
    const raw = sessionStorage.getItem(LINK_PHONE_STORAGE_KEY);
    if (!raw) return { step: 'phone', inputPhone: '' };
    const parsed = JSON.parse(raw);
    if (parsed.step === 'code' && parsed.inputPhone) return parsed;
  } catch {
    // sessionStorage indisponível ou dado corrompido — ignora e começa do zero
  }
  return { step: 'phone', inputPhone: '' };
}

export default function LinkPhoneCard({ onLinked }: { onLinked: (phone: string) => void }) {
  const initial = useState(loadLinkPhoneState)[0];
  const [step, setStep] = useState<'phone' | 'code'>(initial.step);
  const [inputPhone, setInputPhone] = useState(initial.inputPhone);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initial.step === 'code' ? `Código enviado pro número ${initial.inputPhone}.` : '');
  const [busy, setBusy] = useState(false);

  function persist(nextStep: 'phone' | 'code', phone: string) {
    if (typeof window === 'undefined') return;
    if (nextStep === 'code') {
      sessionStorage.setItem(LINK_PHONE_STORAGE_KEY, JSON.stringify({ step: nextStep, inputPhone: phone }));
    } else {
      sessionStorage.removeItem(LINK_PHONE_STORAGE_KEY);
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = inputPhone.replace(/\D/g, '');
    if (!cleaned) return;
    if (!BR_PHONE_REGEX.test(cleaned)) {
      setError(
        cleaned.length !== 12
          ? `Esse número tem ${cleaned.length} dígitos, precisa ter 12 (DDI + DDD + número, sem o 9 extra). Ex.: 555180562381.`
          : 'Número inválido. Use DDI 55 + DDD + número, sem o 9 extra. Ex.: 555180562381.'
      );
      return;
    }
    setBusy(true);
    setError('');
    const { ok, json } = await authedFetch('/api/phone/request-code', { phone: cleaned });
    setBusy(false);
    if (!ok) {
      setError(json.error || 'Erro ao enviar código.');
      return;
    }
    setNotice(`Código enviado pro número ${cleaned}.`);
    setStep('code');
    persist('code', cleaned);
  }

  async function handleConfirmCode(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = inputPhone.replace(/\D/g, '');
    setBusy(true);
    setError('');
    const { ok, json } = await authedFetch('/api/phone/verify-code', { phone: cleaned, code: code.trim() });
    setBusy(false);
    if (!ok) {
      setError(json.error || 'Código incorreto.');
      return;
    }
    persist('phone', '');
    onLinked(cleaned);
  }

  if (step === 'code') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--areia)] px-4 py-8">
        <form onSubmit={handleConfirmCode} className="w-full max-w-md bg-[var(--creme)] p-7 sm:p-8 rounded-2xl border-2 border-[var(--borda)]">
          <h1 className="titulo text-3xl text-[var(--tinta)] mb-2">Digite o código</h1>
          <p className="text-lg text-[var(--tinta-media)] mb-6 leading-relaxed">
            {notice} Abra o WhatsApp e copie o código de 6 dígitos que o Guará mandou.
          </p>
          <label htmlFor="codigo" className="block text-base font-semibold text-[var(--tinta)] mb-2">
            Código de 6 dígitos
          </label>
          <input
            id="codigo"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className="bloco-cifra w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl px-4 py-4 mb-4 text-center text-4xl tracking-[0.25em] focus:outline-none focus:border-[var(--ferrugem)]"
          />
          {error && (
            <p className="text-base font-semibold text-[var(--sobre-cor)] bg-[var(--carmim)] rounded-xl px-4 py-3 mb-4">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="rotulo w-full bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl hover:bg-[var(--ferrugem-escura)] transition disabled:opacity-60"
          >
            Confirmar
          </button>
          <button
            type="button"
            onClick={() => { setStep('phone'); setError(''); setNotice(''); setCode(''); persist('phone', ''); }}
            className="w-full text-base text-[var(--tinta-media)] mt-4 underline underline-offset-2"
          >
            Usar outro número
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--areia)] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bloco px-7 py-7 mb-4" style={{ backgroundColor: 'var(--ferrugem)' }}>
          <h1 className="titulo text-4xl leading-none">Falta um passo</h1>
          <p className="text-lg mt-3 opacity-95">
            Vamos vincular seu número à sua conta, pra seus gastos caírem aqui.
          </p>
        </div>

        <form onSubmit={handleSendCode} className="bg-[var(--creme)] p-7 sm:p-8 rounded-2xl border-2 border-[var(--borda)]">
          <ol className="space-y-4 mb-7">
            <PassoLista numero={1}>
              Abra o WhatsApp e mande qualquer mensagem (pode ser só &quot;oi&quot;) para o Guará no{' '}
              <strong className="text-[var(--tinta)]">+55 51 8056-2381</strong>, usando o celular que você quer ligar aqui.
            </PassoLista>
            <PassoLista numero={2}>Volte para esta tela e digite esse mesmo número no campo abaixo.</PassoLista>
            <PassoLista numero={3}>O Guará te manda um código pelo WhatsApp. Você digita ele na próxima tela e pronto.</PassoLista>
          </ol>

          <label htmlFor="telefone" className="block text-base font-semibold text-[var(--tinta)] mb-2">
            Seu número de telefone
          </label>
          <input
            id="telefone"
            type="tel"
            value={inputPhone}
            onChange={(e) => setInputPhone(e.target.value)}
            placeholder="555180562381"
            className="w-full bg-[var(--areia)] border-2 border-[var(--borda)] text-[var(--tinta)] placeholder:text-[var(--tinta-fraca)] rounded-xl px-4 py-3.5 mb-2 text-xl tabular focus:outline-none focus:border-[var(--ferrugem)]"
          />
          <p className="text-sm text-[var(--tinta-media)] mb-5 leading-relaxed">
            DDI 55 + DDD + número, <strong className="text-[var(--tinta)]">sem o 9 extra</strong>, sem espaço nem traço.
            São 12 dígitos ao todo. Exemplo: <strong className="text-[var(--tinta)] tabular">555180562381</strong>.
          </p>
          {error && (
            <p className="text-base font-semibold text-[var(--sobre-cor)] bg-[var(--carmim)] rounded-xl px-4 py-3 mb-4">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rotulo w-full bg-[var(--ferrugem)] text-[var(--sobre-cor)] text-base py-4 rounded-xl hover:bg-[var(--ferrugem-escura)] transition disabled:opacity-60"
          >
            Enviar código
          </button>
        </form>
      </div>
    </main>
  );
}
