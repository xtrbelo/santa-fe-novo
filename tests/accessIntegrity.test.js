import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectAccessIntegrityData } from '../src/utils/accessIntegrity.js';

const member = (id, email, overrides = {}) => ({ id, nome: id, email, vinculo: 'membro', ativo: true, ...overrides });
const user = (uid, email, pessoaBaseId, overrides = {}) => ({ id: uid, uid, email, pessoaBaseId, role: 'atendimento', ativo: true, ...overrides });

test('considera correto somente o vínculo completo entre Usuário, Pessoa e índice', () => {
  const report = inspectAccessIntegrityData({
    users: [user('u1', 'membro@example.test', 'p1')],
    people: [member('p1', 'membro@example.test')],
    indexes: [{ id: 'p1', pessoaBaseId: 'p1', uid: 'u1' }],
  });
  assert.equal(report.analyzed, 1);
  assert.equal(report.correct, 1);
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.orphanIndexes, []);
  assert.deepEqual(report.emailConflicts, []);
});

test('identifica Pessoa inexistente e sugere reparo apenas com um Membro compatível', () => {
  const report = inspectAccessIntegrityData({
    users: [user('u1', ' membro@example.test ', 'excluida')],
    people: [member('p1', 'MEMBRO@example.test')],
    indexes: [{ id: 'excluida', pessoaBaseId: 'excluida', uid: 'u1' }],
  });
  assert.equal(report.issues[0].code, 'PESSOA_INEXISTENTE');
  assert.equal(report.issues[0].suggestedPessoaId, 'p1');
  assert.equal(report.issues[0].repairable, true);
  assert.equal(report.orphanIndexes.length, 1);
});

test('não sugere reparo ambíguo, inativo ou ocupado por outra conta', () => {
  const baseUser = user('u1', 'membro@example.test', null);
  const ambiguous = inspectAccessIntegrityData({
    users: [baseUser],
    people: [member('p1', 'membro@example.test'), member('p2', 'membro@example.test')],
    indexes: [],
  });
  assert.equal(ambiguous.issues[0].repairable, false);

  const occupied = inspectAccessIntegrityData({
    users: [baseUser, user('u2', 'outro@example.test', 'p1')],
    people: [member('p1', 'membro@example.test')],
    indexes: [{ id: 'p1', pessoaBaseId: 'p1', uid: 'u2' }],
  });
  assert.equal(occupied.issues[0].repairable, false);
});

test('classifica membro inativo, e-mail divergente e índices ausente ou divergente', () => {
  const report = inspectAccessIntegrityData({
    users: [
      user('inativo', 'a@example.test', 'p-inativa'),
      user('email', 'b@example.test', 'p-email'),
      user('sem-indice', 'c@example.test', 'p-sem-indice'),
      user('indice', 'd@example.test', 'p-indice'),
    ],
    people: [
      member('p-inativa', 'a@example.test', { ativo: false }),
      member('p-email', 'outro@example.test'),
      member('p-sem-indice', 'c@example.test'),
      member('p-indice', 'd@example.test'),
    ],
    indexes: [{ id: 'p-indice', pessoaBaseId: 'p-indice', uid: 'outro' }],
  });
  assert.deepEqual(report.issues.map(item => item.code), ['PESSOA_INATIVA', 'EMAIL_DIVERGENTE', 'INDICE_AUSENTE', 'INDICE_DIVERGENTE']);
  assert.equal(report.issues.find(item => item.code === 'INDICE_AUSENTE').repairable, true);
});

test('lista e-mails repetidos somente entre Membros ativos', () => {
  const report = inspectAccessIntegrityData({
    users: [],
    people: [
      member('p1', ' DUPLICADO@example.test '),
      member('p2', 'duplicado@example.test'),
      member('p3', 'duplicado@example.test', { ativo: false }),
      member('p4', 'duplicado@example.test', { vinculo: 'consulente' }),
    ],
    indexes: [],
  });
  assert.deepEqual(report.emailConflicts, [{
    email: 'duplicado@example.test',
    people: [
      { id: 'p1', nome: 'p1', cpf: null, contato: null, linkedUid: null },
      { id: 'p2', nome: 'p2', cpf: null, contato: null, linkedUid: null },
    ],
  }]);
});
