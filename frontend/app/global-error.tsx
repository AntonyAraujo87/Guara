'use client';

// A última rede de segurança: o erro que acontece no próprio layout raiz.
//
// O error.tsx normal vive DENTRO do layout, então não consegue se desenhar
// quando é o layout que quebra. Este substitui o documento inteiro — por isso
// ele traz <html> e <body> próprios, e por isso o estilo vem embutido: as
// folhas de estilo do app podem ser exatamente o que falhou.

export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#EFE3D2',
          color: '#191007',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '20px',
        }}
      >
        <div
          style={{
            maxWidth: '420px',
            width: '100%',
            background: '#FFFBF4',
            border: '2px solid #DDCDB6',
            borderRadius: '16px',
            padding: '28px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🐺</div>

          <h1 style={{ fontSize: '22px', margin: '0 0 12px', color: '#191007' }}>
            O Guará travou feio
          </h1>

          <p style={{ fontSize: '15px', lineHeight: 1.6, color: '#5C4A36', margin: '0 0 24px' }}>
            Isso é falha nossa, não sua. Seus dados estão salvos — nada aqui apaga nada.
          </p>

          <button
            onClick={reset}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: '#C4400D',
              color: '#FFFBF4',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '10px',
            }}
          >
            Recarregar
          </button>

          <a
            href="https://wa.me/555180562381"
            style={{
              display: 'block',
              padding: '14px',
              borderRadius: '12px',
              border: '2px solid #DDCDB6',
              color: '#5C4A36',
              fontSize: '15px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Usar pelo WhatsApp
          </a>

          <p style={{ fontSize: '13px', color: '#5C4A36', marginTop: '20px', marginBottom: 0 }}>
            Tudo que o painel faz, o WhatsApp também faz.
          </p>

          {error.digest && (
            <p style={{ fontSize: '11px', color: '#5C4A36', marginTop: '16px', opacity: 0.7 }}>
              código: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
