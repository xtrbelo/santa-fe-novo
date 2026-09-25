import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookVerificationUrl } from '../src/utils/bookVerification.js';

test('monta link de verificação conforme o ambiente aberto', () => {
  assert.equal(buildBookVerificationUrl('https://santa-fe-v2-hml.web.app/', 'abc123abc123'), 'https://santa-fe-v2-hml.web.app/verificar-livro?codigo=ABC123ABC123');
  assert.equal(buildBookVerificationUrl('https://caesf.com.br', 'ABC123ABC123'), 'https://caesf.com.br/verificar-livro?codigo=ABC123ABC123');
});
