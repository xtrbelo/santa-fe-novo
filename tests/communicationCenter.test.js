import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommunicationWhatsappUrl, getCommunicationDiagnostic, isValidCommunicationEmail, summarizeCommunications } from '../src/utils/communicationCenter.js';

test('resume comunicações por situação', () => {
  assert.deepEqual(summarizeCommunications([{ status: 'enviado' }, { status: 'erro' }, { status: 'erro' }, { status: 'enviando' }]), { enviado: 1, enviando: 1, erro: 2, outros: 0 });
});

test('monta WhatsApp somente quando há contato válido', () => {
  assert.match(buildCommunicationWhatsappUrl({ nome: 'Maria', contato: '(96) 99999-9999' }), /^https:\/\/wa\.me\/5596999999999\?text=/);
  assert.equal(buildCommunicationWhatsappUrl({ nome: 'Maria', contato: '123' }), null);
});

test('bloqueia reenvio quando o e-mail atual está inválido', () => {
  assert.equal(isValidCommunicationEmail('maria@exemplo.com'), true);
  assert.equal(isValidCommunicationEmail('maria@'), false);
  assert.deepEqual(getCommunicationDiagnostic({ status: 'erro', erro: 'ENVIO_NAO_CONCLUIDO' }, { email: 'maria@' }), {
    code: 'DESTINATARIO_INVALIDO',
    title: 'E-mail ausente ou inválido',
    message: 'Corrija o e-mail no cadastro da Pessoa antes de solicitar o reenvio.',
    canResend: false,
  });
});

test('orienta a falha e avisa quando o destinatário foi atualizado', () => {
  const result = getCommunicationDiagnostic({ status: 'erro', erro: 'ENVIO_NAO_CONCLUIDO', destinatario: 'antigo@exemplo.com' }, { email: 'novo@exemplo.com', ativo: true });
  assert.equal(result.canResend, true);
  assert.equal(result.destinationChanged, true);
  assert.equal(result.currentEmail, 'novo@exemplo.com');
  assert.equal(result.code, 'ENVIO_NAO_CONCLUIDO');
});
