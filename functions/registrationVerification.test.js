import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistrationEvidenceHash, buildRegistrationVerificationEmail, hashVerificationCode, isVerificationEmail, verificationCodeMatches } from './registrationVerification.js';

test('valida endereço e compara o código sem guardar valor aberto', () => {
  assert.equal(isVerificationEmail(' MEMBRO@EXAMPLE.COM '), true);
  assert.equal(isVerificationEmail('invalido'), false);
  const expectedHash = hashVerificationCode({ verificationId: 'prova1', code: '123456' });
  assert.equal(verificationCodeMatches({ verificationId: 'prova1', code: '123456', expectedHash }), true);
  assert.equal(verificationCodeMatches({ verificationId: 'prova1', code: '654321', expectedHash }), false);
  assert.equal(expectedHash.includes('123456'), false);
});

test('resumo criptográfico é estável e muda quando o conteúdo muda', () => {
  const first = buildRegistrationEvidenceHash({ nome: 'Maria', aceite: { versao: '1', protocolo: 'abc' } });
  assert.equal(first, buildRegistrationEvidenceHash({ aceite: { protocolo: 'abc', versao: '1' }, nome: 'Maria' }));
  assert.notEqual(first, buildRegistrationEvidenceHash({ nome: 'Maria Silva', aceite: { versao: '1', protocolo: 'abc' } }));
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('gera mensagem objetiva de confirmação', () => {
  const message = buildRegistrationVerificationEmail('123456');
  assert.match(message.subject, /Código de confirmação/);
  assert.match(message.text, /123456/);
  assert.match(message.text, /10 minutos/);
});
