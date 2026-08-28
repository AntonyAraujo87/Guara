// Baixa áudio e imagem que a pessoa manda no WhatsApp.
//
// A Meta não entrega o arquivo no webhook — manda só um id. Pegar o conteúdo
// são dois pedidos: um pra descobrir a URL temporária, outro pra baixar de lá,
// e o segundo TAMBÉM precisa do token (a URL sozinha não abre).

const axios = require('axios');

const VERSAO = process.env.META_API_VERSION || 'v21.0';
const TOKEN = process.env.META_ACCESS_TOKEN;

// Teto de tamanho. O WhatsApp aceita até 16MB, mas um áudio desse tamanho são
// vários minutos de fala: a transcrição levaria mais de dois minutos (medido) e
// a pessoa acharia que o bot morreu. Melhor pedir pra encurtar.
const TETO_AUDIO = 3 * 1024 * 1024;
const TETO_IMAGEM = 5 * 1024 * 1024;

const TIPOS_AUDIO = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/amr', 'audio/aac', 'audio/wav', 'audio/x-wav'];
const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// A Meta manda 'audio/ogg; codecs=opus'; o Gemini quer só o tipo.
function tipoLimpo(mime) {
  return String(mime || '').split(';')[0].trim().toLowerCase();
}

async function baixarMidia(mediaId, { teto }) {
  const meta = await axios.get(`https://graph.facebook.com/${VERSAO}/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 15_000,
  });

  const { url, mime_type: mimeType, file_size: tamanho } = meta.data || {};
  if (!url) throw new Error('A Meta não devolveu URL para a mídia ' + mediaId);
  if (tamanho && tamanho > teto) {
    const erro = new Error('grande_demais');
    erro.tamanho = tamanho;
    throw erro;
  }

  const arquivo = await axios.get(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    responseType: 'arraybuffer',
    timeout: 30_000,
    maxContentLength: teto,
  });

  return { buffer: Buffer.from(arquivo.data), mimeType: tipoLimpo(mimeType) };
}

async function baixarAudio(mediaId) {
  const r = await baixarMidia(mediaId, { teto: TETO_AUDIO });
  // Tipo estranho ainda vale a tentativa: o Gemini aceita mais formatos do que
  // esta lista, e recusar aqui seria negar uma coisa que ia funcionar.
  if (!TIPOS_AUDIO.includes(r.mimeType)) r.mimeType = 'audio/ogg';
  return r;
}

async function baixarImagem(mediaId) {
  const r = await baixarMidia(mediaId, { teto: TETO_IMAGEM });
  if (!TIPOS_IMAGEM.includes(r.mimeType)) r.mimeType = 'image/jpeg';
  return r;
}

module.exports = { baixarAudio, baixarImagem, TETO_AUDIO, TETO_IMAGEM };
