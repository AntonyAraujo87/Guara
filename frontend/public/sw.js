// Service worker do Guará.
//
// O trabalho dele é um só: fazer o app ABRIR sem internet, em vez de mostrar
// o dinossauro do navegador. Nada além disso.
//
// A decisão que define este arquivo: NUNCA guardar resposta de dado.
//
// Num app de dinheiro, mostrar saldo velho como se fosse atual é pior do que
// não mostrar nada — a pessoa decide gastar em cima de um número que já mudou.
// Então só os arquivos do app são guardados; saldo, gastos e tudo que vem do
// Supabase passam direto. Sem internet, a tela abre e diz que está sem conexão,
// que é a verdade.
//
// A outra decisão: rede primeiro, cache depois. Assim uma versão nova sempre
// chega. Service worker que serve do cache primeiro deixa gente presa numa
// versão antiga por semanas, e o jeito de sair é limpar dados do site — coisa
// que ninguém sabe fazer.

const VERSAO = 'guara-v1';
const CASCA = ['/', '/instalar', '/manifest.json', '/logo.png', '/icon.png'];

self.addEventListener('install', (evento) => {
  // Guarda a casca do app sem deixar que um arquivo faltando derrube a
  // instalação inteira: cada um por si.
  evento.waitUntil(
    caches.open(VERSAO)
      .then((cache) => Promise.allSettled(CASCA.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  // Apaga as versões antigas. Sem isto o navegador acumula uma cópia do app a
  // cada publicação, e o espaço acaba estourando a cota do site.
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// O que NUNCA passa pelo cache. A ordem importa menos que a lista estar certa:
// errar pra mais aqui só custa uma requisição; errar pra menos serve número
// velho como se fosse de agora.
function ehDado(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/meta-webhook') ||
    url.hostname.endsWith('.supabase.co') ||
    url.hostname.endsWith('.cloudflare.com') ||
    url.hostname.includes('challenges.cloudflare')
  );
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;

  // Só GET. POST é sempre ação — mandar de novo do cache criaria lançamento
  // duplicado, que é justamente o bug que passamos a semana consertando.
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin && !url.hostname.endsWith('.supabase.co')) return;
  if (ehDado(url)) return;

  evento.respondWith(
    fetch(pedido)
      .then((resposta) => {
        // Guarda uma cópia do que deu certo, pra próxima vez que faltar rede.
        if (resposta.ok && url.origin === self.location.origin) {
          const copia = resposta.clone();
          caches.open(VERSAO).then((cache) => cache.put(pedido, copia)).catch(() => {
            // Cota cheia ou modo privativo: seguir sem cache é melhor do que falhar.
          });
        }
        return resposta;
      })
      .catch(async () => {
        const guardado = await caches.match(pedido);
        if (guardado) return guardado;

        // Navegação sem rede e sem cópia: devolve a raiz, que é a casca do app.
        if (pedido.mode === 'navigate') {
          const casca = await caches.match('/');
          if (casca) return casca;
        }
        return Response.error();
      })
  );
});
