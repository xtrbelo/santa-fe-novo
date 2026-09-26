import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidCpf, normalizeCpf } from './cpfValidation.js';

test('normaliza e valida matematicamente o CPF no servidor', () => {
  assert.equal(normalizeCpf('529.982.247-25'), '52998224725');
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('123.456.789-00'), false);
  assert.equal(isValidCpf('123'), false);
});
