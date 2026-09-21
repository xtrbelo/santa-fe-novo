import test from 'node:test';
import assert from 'node:assert/strict';
import { getRegistrationRequestIssues, summarizeRegistrationQueue } from '../src/utils/registrationQueueHealth.js';

test('identifica campos ausentes e possível CPF duplicado', () => {
  const issues = getRegistrationRequestIssues({ statusCadastro: 'aguardando_validacao', tipoCadastro: 'membro', nome: 'Maria', cpf: '529.982.247-25', contato: '96999999999' }, new Set(['52998224725']));
  assert.equal(issues.duplicateCpf, true);
  assert.deepEqual(issues.missing, ['E-mail', 'Data de nascimento', 'Cidade', 'UF']);
  assert.equal(issues.needsAttention, true);
});

test('resume pendências e decisões sem classificar analisadas como problema', () => {
  const requests = [
    { statusCadastro: 'aguardando_validacao', tipoCadastro: 'consulente', nome: 'Ana', cpf: '1', contato: '9' },
    { statusCadastro: 'aguardando_validacao', tipoCadastro: 'consulente', nome: 'Bia', cpf: '2', contato: '' },
    { statusCadastro: 'aprovado' }, { statusCadastro: 'rejeitado' },
  ];
  assert.deepEqual(summarizeRegistrationQueue(requests, new Set(['1'])), { pending: 2, incomplete: 1, duplicate: 1, approved: 1, rejected: 1 });
});
