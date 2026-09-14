import test from 'node:test';
import assert from 'node:assert/strict';
import { getRegistrationNotification } from '../src/utils/registrationNotification.js';

test('direciona WhatsApp ao contato cadastrado e prepara o e-mail', () => {
  const result = getRegistrationNotification({ nome: 'Maria Silva', contato: '(96) 99999-1111', email: 'maria@example.test', statusCadastro: 'aprovado' });
  assert.match(result.whatsappUrl, /^https:\/\/wa\.me\/5596999991111\?text=/);
  assert.match(result.emailUrl, /^mailto:maria%40example\.test\?/);
  assert.match(result.message, /cadastro.*aprovado/);
});

test('inclui o motivo na comunicação de rejeição e ignora pendentes', () => {
  assert.match(getRegistrationNotification({ nome: 'João', contato: '96999991111', email: 'j@example.test', statusCadastro: 'rejeitado', motivoRejeicao: 'CPF ilegível' }).message, /CPF ilegível/);
  assert.equal(getRegistrationNotification({ statusCadastro: 'aguardando_validacao' }), null);
});
