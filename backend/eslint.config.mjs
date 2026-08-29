// Lint do backend.
//
// Existia no frontend e não aqui, o que é o contrário do razoável: um erro no
// painel deixa uma tela feia, um erro aqui para o WhatsApp inteiro. Já
// aconteceu duas vezes — uma função apagada que continuava no `module.exports`,
// e um arquivo novo fora da lista do Dockerfile.
//
// As regras foram escolhidas pelo que já quebrou a produção, não por gosto:
//   - no-undef            → pega ReferenceError antes do deploy
//   - no-unused-vars      → pega import morto e resto de refatoração
//   - require-atomic-updates → pega race condition em await
//   - no-return-await, no-constant-condition, no-dupe-keys → erros silenciosos
//
// `node verificar-modulos.js` continua sendo necessário: o lint não sabe que um
// export aponta pra função que não existe mais.

import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Argumento não usado passa se começar com _, que é o jeito de dizer
      // "sei que está aqui, é da assinatura".
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Ler-modificar-gravar com await no meio é como duas mensagens ao mesmo
      // tempo se sobrescreveram nas carteiras.
      'require-atomic-updates': 'error',
      'no-constant-binary-expression': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'warn',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      'no-promise-executor-return': 'error',
      'no-await-in-loop': 'off',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    ignores: ['node_modules/**'],
  },
];
