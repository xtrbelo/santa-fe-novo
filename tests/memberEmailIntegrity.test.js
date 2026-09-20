import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMemberEmailIndexData } from '../src/utils/memberEmailIntegrity.js';

const member = (id, email, overrides = {}) => ({ id, nome: id, email, vinculo: 'membro', ativo: true, ...overrides });
const index = (email, pessoaId, overrides = {}) => ({ id: encodeURIComponent(email), email, pessoaId, ...overrides });

test('reconhece índice correto e e-mail normalizado', () => {
  const report = inspectMemberEmailIndexData({
    people: [member('p1', ' MEMBRO@example.test ')],
    indexes: [index('membro@example.test', 'p1')],
  });
  assert.equal(report.analyzed, 1);
  assert.equal(report.correct, 1);
  assert.deepEqual(report.missing, []);
});

test('considera reparável somente índice ausente de e-mail único', () => {
  const report = inspectMemberEmailIndexData({ people: [member('p1', 'unico@example.test')], indexes: [] });
  assert.deepEqual(report.missing, [{ pessoaId: 'p1', nome: 'p1', email: 'unico@example.test' }]);
  assert.deepEqual(report.conflicts, []);
});

test('preserva duplicidades entre Membros ativos para análise manual', () => {
  const report = inspectMemberEmailIndexData({
    people: [member('p1', 'repetido@example.test'), member('p2', 'REPETIDO@example.test')],
    indexes: [],
  });
  assert.equal(report.conflicts.length, 1);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.conflicts[0].people.map(person => person.pessoaId), ['p1', 'p2']);
});

test('separa e-mail inválido, índice divergente e índice órfão', () => {
  const report = inspectMemberEmailIndexData({
    people: [member('p1', 'invalido'), member('p2', 'valido@example.test'), member('p3', 'inativo@example.test', { ativo: false })],
    indexes: [index('valido@example.test', 'outra-pessoa'), index('inativo@example.test', 'p3')],
  });
  assert.equal(report.invalid.length, 1);
  assert.equal(report.indexConflicts.length, 1);
  assert.equal(report.orphanIndexes.length, 2);
  assert.deepEqual(report.missing, []);
});

test('ignora Consulentes na manutenção de e-mails de Membros', () => {
  const report = inspectMemberEmailIndexData({ people: [member('p1', null, { vinculo: 'consulente' })], indexes: [] });
  assert.equal(report.analyzed, 0);
  assert.deepEqual(report.invalid, []);
});
