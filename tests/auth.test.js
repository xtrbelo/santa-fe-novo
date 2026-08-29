import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthErrorMessage, normalizeAuthEmail, usesPasswordProvider, validateRegistration } from '../src/utils/auth.js';

test('normaliza e-mail sem alterar a senha', () => {
  assert.equal(normalizeAuthEmail(' JOAO@EMAIL.COM '), 'joao@email.com');
});

test('valida nome, tamanho e confirmação da senha', () => {
  assert.equal(validateRegistration({ nome: '', email: 'a@b.com', senha: '12345678', confirmarSenha: '12345678' }), 'Informe seu nome.');
  assert.equal(validateRegistration({ nome: 'João', email: 'a@b.com', senha: '123', confirmarSenha: '123' }), 'A senha deve ter pelo menos 8 caracteres.');
  assert.equal(validateRegistration({ nome: 'João', email: 'a@b.com', senha: '12345678', confirmarSenha: '87654321' }), 'As senhas não coincidem.');
  assert.equal(validateRegistration({ nome: 'João', email: 'a@b.com', senha: '12345678', confirmarSenha: '12345678' }), null);
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
