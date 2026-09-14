import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApprovedRegistrationEmail, sendMailjetEmail, shouldSendApprovedRegistrationEmail } from './registrationEmail.js';

test('envia somente quando um cadastro de membro com e-mail passa para aprovado', () => {
  assert.equal(shouldSendApprovedRegistrationEmail({ before: { statusCadastro: 'aguardando_validacao' }, after: { statusCadastro: 'aprovado', tipoCadastro: 'membro', email: 'membro@example.com' } }), true);
  assert.equal(shouldSendApprovedRegistrationEmail({ before: { statusCadastro: 'aguardando_validacao' }, after: { statusCadastro: 'aprovado', tipoCadastro: 'consulente', email: 'pessoa@example.com' } }), false);
  assert.equal(shouldSendApprovedRegistrationEmail({ before: { statusCadastro: 'aprovado' }, after: { statusCadastro: 'aprovado', tipoCadastro: 'membro', email: 'membro@example.com' } }), false);
});

test('monta mensagem aprovada sem permitir html no nome', () => {
  const result = buildApprovedRegistrationEmail({ nome: '<João>' });
  assert.match(result.text, /<João>/);
  assert.match(result.html, /&lt;João&gt;/);
  assert.doesNotMatch(result.html, /<João>/);
});

test('envia pelo endpoint seguro do Mailjet', async () => {
  let request;
  const fetchImpl = async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ Messages: [{ Status: 'success' }] }) }; };
  await sendMailjetEmail({ apiKey: 'key', secretKey: 'secret', fromEmail: 'casa@example.com', registration: { nome: 'Maria', email: 'maria@example.com' }, fetchImpl });
  assert.equal(request.url, 'https://api.mailjet.com/v3.1/send');
  assert.match(request.options.headers.Authorization, /^Basic /);
  const sent = JSON.parse(request.options.body).Messages[0];
  assert.equal(sent.To[0].Email, 'maria@example.com');
  assert.equal(sent.ReplyTo.Email, 'casa@example.com');
  assert.match(sent.HTMLPart, /Cadastro aprovado/);
});
