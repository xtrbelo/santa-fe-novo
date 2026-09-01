import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTH_VIEW, getAuthErrorMessage, getLoginAutocomplete, normalizeAuthEmail, rejectUnauthorizedSession, resolveAuthView, UNAUTHORIZED_ACCESS_MESSAGE, usesPasswordProvider } from '../src/utils/auth.js';

test('normaliza e-mail sem alterar a senha', () => {
  assert.equal(normalizeAuthEmail(' JOAO@EMAIL.COM '), 'joao@email.com');
});

test('traduz erros conhecidos sem expor códigos internos', () => {
  assert.match(getAuthErrorMessage({ code: 'auth/invalid-credential' }), /Confira e-mail e senha/);
  assert.match(getAuthErrorMessage({ code: 'auth/account-exists-with-different-credential' }), /método utilizado originalmente/);
  assert.doesNotMatch(getAuthErrorMessage({ code: 'auth/erro-desconhecido' }), /auth\//);
});

test('identifica apenas contas com provider password', () => {
  assert.equal(usesPasswordProvider({ providerData: [{ providerId: 'password' }] }), true);
  assert.equal(usesPasswordProvider({ providerData: [{ providerId: 'google.com' }] }), false);
});

test('distingue carregamento de conta autenticada sem perfil institucional', () => {
  const admin = { providerData: [{ providerId: 'google.com' }], emailVerified: true };
  assert.equal(resolveAuthView({ loading: true, user: admin, profile: null, pendingRole: 'pendente' }), AUTH_VIEW.LOADING);
  assert.equal(resolveAuthView({ loading: false, user: admin, profile: null, pendingRole: 'pendente' }), AUTH_VIEW.UNAUTHORIZED);
  assert.equal(resolveAuthView({ loading: false, user: admin, profile: { role: 'admin', ativo: true }, pendingRole: 'pendente' }), AUTH_VIEW.AUTHORIZED);
});

for (const providerId of ['password', 'google.com']) {
  test(`encerra sessão ${providerId} sem perfil e retorna ao login com mensagem genérica`, async () => {
    const auth = { currentUser: { providerData: [{ providerId }] } };
    const messages = [];
    await rejectUnauthorizedSession({
      auth,
      signOutUser: async target => { target.currentUser = null; },
      notify: message => messages.push(message),
    });
    assert.equal(auth.currentUser, null);
    assert.deepEqual(messages, [UNAUTHORIZED_ACCESS_MESSAGE]);
    assert.equal(resolveAuthView({ loading: false, user: auth.currentUser, profile: null, pendingRole: 'pendente' }), AUTH_VIEW.LOGIN);
  });
}

test('perfil pendente resolvido continua na tela de liberação', () => {
  const user = { providerData: [{ providerId: 'google.com' }], emailVerified: true };
  assert.equal(resolveAuthView({ loading: false, user, profile: { role: 'pendente', ativo: true }, pendingRole: 'pendente' }), AUTH_VIEW.PENDING);
});

test('mantém estados explícitos para e-mail não verificado e perfil inativo', () => {
  const passwordUser = { providerData: [{ providerId: 'password' }], emailVerified: false };
  assert.equal(resolveAuthView({ loading: false, user: passwordUser, profile: { role: 'atendimento', ativo: true }, pendingRole: 'pendente' }), AUTH_VIEW.EMAIL_NOT_VERIFIED);
  assert.equal(resolveAuthView({ loading: false, user: { providerData: [], emailVerified: true }, profile: { role: 'admin', ativo: false }, pendingRole: 'pendente' }), AUTH_VIEW.INACTIVE);
});

test('suspende acesso de perfil vinculado a Membro inativo sem afetar legado', () => {
  const user = { providerData: [{ providerId: 'google.com' }], emailVerified: true };
  assert.equal(resolveAuthView({ loading: false, user, profile: { role: 'gestor', ativo: true, pessoaBaseId: 'membro-1', pessoaAtiva: false }, pendingRole: 'pendente' }), AUTH_VIEW.SUSPENDED);
  assert.equal(resolveAuthView({ loading: false, user, profile: { role: 'gestor', ativo: true, pessoaAtiva: true }, pendingRole: 'pendente' }), AUTH_VIEW.AUTHORIZED);
});

test('inicialização carrega e logout retorna ao login', () => {
  assert.equal(resolveAuthView({ loading: true, user: null, profile: null, pendingRole: 'pendente' }), AUTH_VIEW.LOADING);
  assert.equal(resolveAuthView({ loading: false, user: null, profile: null, pendingRole: 'pendente' }), AUTH_VIEW.LOGIN);
});

test('login desativa autocomplete automático', () => {
  assert.deepEqual(getLoginAutocomplete(), { form: 'off', email: 'off', password: 'off' });
});

test('tela interna oferece apenas login, Google e recuperação de senha', () => {
  const source = readFileSync(new URL('../src/components/auth/LoginScreen.jsx', import.meta.url), 'utf8');
  for (const expected of ['E-mail', 'Senha', 'Entrar com Google', 'Esqueci minha senha']) assert.match(source, new RegExp(expected));
  for (const removed of ['Solicitar acesso', 'Criar conta', 'Confirmar senha', 'onRegister']) assert.doesNotMatch(source, new RegExp(removed));
});

test('tela não autorizada oculta completamente os dados da conta', () => {
  const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const unauthorizedBranch = appSource.slice(appSource.indexOf('AUTH_VIEW.UNAUTHORIZED'), appSource.indexOf('AUTH_VIEW.EMAIL_NOT_VERIFIED'));
  assert.match(unauthorizedBranch, /title="Acesso não autorizado"/);
  assert.match(unauthorizedBranch, /Procure um administrador da Casa Santa Fé/);
  assert.match(unauthorizedBranch, /showAccountDetails=\{false\}/);
  assert.doesNotMatch(unauthorizedBranch, /user=|profile=/);

  const accessScreenSource = readFileSync(new URL('../src/components/auth/AccessScreen.jsx', import.meta.url), 'utf8');
  assert.match(accessScreenSource, /showAccountDetails &&/);
  assert.match(accessScreenSource, />Sair</);
});

test('aplicação preserva autocadastro público de membro sem autocriar perfil de usuário', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /AutocadastroMembroPage/);
  assert.match(source, /\/autocadastro/);
  assert.doesNotMatch(source, /createUserWithEmailAndPassword|handleRegister|setDoc\(ref/);
  assert.doesNotMatch(source, /where\([^\n]*email|query\([^\n]*usuarios/);
});
