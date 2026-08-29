// Roda DENTRO do container, com as variaveis que o container realmente carregou.
//
// Os testes anteriores usam o token que a pessoa colou. Este usa o que o
// processo tem em memoria — que e a unica coisa que importa quando um cliente
// manda mensagem. Se o compose nao releu o .env, e aqui que aparece.

const id = process.env.META_PHONE_NUMBER_ID;
const token = process.env.META_ACCESS_TOKEN;

if (!id || !token) {
  console.log('ERRO o container subiu sem META_PHONE_NUMBER_ID ou META_ACCESS_TOKEN');
  process.exit(0);
}

const url = `https://graph.facebook.com/v21.0/${id}?fields=display_phone_number&access_token=${token}`;

fetch(url)
  .then((r) => r.json())
  .then((d) => {
    console.log(d.error ? `ERRO ${d.error.message}` : `OK ${d.display_phone_number}`);
  })
  .catch((e) => console.log(`ERRO ${e.message}`));
