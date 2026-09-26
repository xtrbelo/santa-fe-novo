import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMemberEmailAvailable, findActiveMemberEmailConflict, getMemberEmailIndexId, validateSecurePersonPayload } from './personIdentity.js';

const member = (id, email, overrides = {}) => ({ id, nome: id, email, vinculo: 'membro', ativo: true, ...overrides });

test('normaliza o identificador do índice sem permitir barra no caminho', () => {
  assert.equal(getMemberEmailIndexId(' MEMBRO/TESTE@Example.test '), 'membro%2Fteste%40example.test');
});

test('encontra conflito somente entre outros Membros ativos', () => {
  const current = member('p1', 'membro@example.test');
  const people = [current, member('p2', 'MEMBRO@example.test'), member('p3', 'membro@example.test', { ativo: false }), member('p4', 'membro@example.test', { vinculo: 'consulente' })];
  assert.equal(findActiveMemberEmailConflict({ personId: 'p1', person: current, people })?.id, 'p2');
  assert.equal(findActiveMemberEmailConflict({ personId: 'p1', person: { ...current, ativo: false }, people }), null);
});

test('bloqueia duplicidade encontrada nos cadastros ou no índice transacional', () => {
  const person = member('p1', 'membro@example.test');
  assert.throws(() => assertMemberEmailAvailable({ personId: 'p1', person, people: [person, member('p2', 'membro@example.test')] }), /EMAIL_MEMBRO_DUPLICADO/);
  assert.throws(() => assertMemberEmailAvailable({ personId: 'p1', person, people: [person], index: { pessoaId: 'p2' } }), /EMAIL_MEMBRO_DUPLICADO/);
  assert.doesNotThrow(() => assertMemberEmailAvailable({ personId: 'p1', person, people: [person], index: { pessoaId: 'p1' } }));
});

test('exige identidade mínima válida para Membro e aceita Consulente', () => {
  assert.doesNotThrow(() => validateSecurePersonPayload({ vinculo: 'membro', nome: 'Membro', cpf: '52998224725', email: 'membro@example.test' }));
  assert.doesNotThrow(() => validateSecurePersonPayload({ vinculo: 'consulente', nome: 'Consulente' }));
  assert.throws(() => validateSecurePersonPayload({ vinculo: 'consulente', nome: 'Consulente', cpf: '12345678900' }), /CPF_INVALIDO/);
  assert.throws(() => validateSecurePersonPayload({ vinculo: 'membro', nome: 'Membro', cpf: '12345678900', email: 'membro@example.test' }), /CPF_INVALIDO|CPF_MEMBRO_INVALIDO/);
  assert.throws(() => validateSecurePersonPayload({ vinculo: 'membro', nome: 'Membro', cpf: '52998224725', email: 'invalido' }), /EMAIL_MEMBRO_INVALIDO/);
});
