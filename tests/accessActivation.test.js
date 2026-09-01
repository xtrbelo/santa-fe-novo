import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAccessActivationActionCodeSettings, validateAccessActivationPassword } from '../src/utils/accessActivation.js';
import { sendAccessActivationEmail, sendUserPasswordReset } from '../src/services/firebase.js';

test('configura link de ativação seguro sem e-mail na URL', () => {
  const settings = buildAccessActivationActionCodeSettings('https://sistema.example/qualquer-rota');
  assert.deepEqual(settings, { url: 'https://sistema.example/ativar-acesso', handleCodeInApp: true });
  assert.doesNotMatch(settings.url, /@|email=/i);
});

test('envio de ativação usa somente o e-mail autorizado normalizado', async () => {
  const calls = [];
  await sendAccessActivationEmail({ email: ' MEMBRO@EXAMPLE.TEST ', origin: 'https://sistema.example' }, {}, async (...args) => calls.push(args));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 'membro@example.test');
  assert.deepEqual(calls[0][2], { url: 'https://sistema.example/ativar-acesso', handleCodeInApp: true });
});

test('reset administrativo usa o e-mail do usuário sem receber senha', async () => {
  const calls = [];
  await sendUserPasswordReset({ email: ' USUARIO@EXAMPLE.TEST ' }, {}, async (...args) => calls.push(args));
  assert.deepEqual(calls, [[{}, 'usuario@example.test']]);
});

test('valida senha e nunca persiste senha no fluxo público', () => {
  assert.equal(validateAccessActivationPassword('1234567', '1234567'), 'SENHA_FRACA');
  assert.equal(validateAccessActivationPassword('SenhaSegura1', 'outraSenha'), 'SENHAS_DIVERGENTES');
  assert.equal(validateAccessActivationPassword('SenhaSegura1', 'SenhaSegura1'), null);
  const source = readFileSync(new URL('../src/modules/AtivacaoAcesso/AtivacaoAcessoPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /signInWithEmailLink/);
  assert.match(source, /findAndClaimAuthorizedAccess/);
  assert.match(source, /updatePassword/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|setDoc|updateDoc/);
});

test('rota pública de ativação não remove login Google existente', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /\/ativar-acesso/);
  assert.match(app, /AtivacaoAcessoPage/);
  assert.match(app, /signInWithPopup/);
  assert.match(app, /GoogleAuthProvider/);
});
