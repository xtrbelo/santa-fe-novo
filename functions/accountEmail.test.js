import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActivationEmail, buildPasswordResetEmail, buildVerificationEmail, getSystemBaseUrl } from './accountEmail.js';

test('gera os três e-mails com links seguros e identidade da Casa', () => {
  const link = 'https://example.test/action?mode=resetPassword&oobCode=abc';
  for (const message of [buildActivationEmail({ nome: 'Maria', link }), buildVerificationEmail({ nome: 'Maria', link }), buildPasswordResetEmail({ nome: 'Maria', link })]) {
    assert.match(message.subject, /Casa Santa Fé/);
    assert.match(message.text, /https:\/\/example\.test\/action/);
    assert.match(message.html, /href="https:\/\/example\.test\/action/);
  }
});

test('mantém URLs de HML e produção separadas', () => {
  assert.equal(getSystemBaseUrl('santa-fe-v2-hml'), 'https://santa-fe-v2-hml.web.app');
  assert.equal(getSystemBaseUrl('santa-fe-v2-prod'), 'https://santa-fe-v2-prod.web.app');
});
