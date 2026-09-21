import test from 'node:test';
import assert from 'node:assert/strict';
import { describePersonAudit, getPersonHistoryCategory } from '../src/utils/personHistory.js';

test('classifica eventos cadastrais, de situação e acesso', () => {
  assert.equal(getPersonHistoryCategory('PESSOA_ATUALIZADA'), 'cadastro');
  assert.equal(getPersonHistoryCategory('MEMBRO_INATIVADO'), 'situacao');
  assert.equal(getPersonHistoryCategory('USUARIO_ROLE_ALTERADO'), 'acesso');
});

test('descreve campos alterados e mudança de perfil', () => {
  assert.equal(describePersonAudit({ tipo: 'PESSOA_ATUALIZADA', camposAlterados: ['contato', 'funcoesCasa'] }).details, 'Campos: contato, funcoesCasa');
  assert.equal(describePersonAudit({ tipo: 'USUARIO_ROLE_ALTERADO', valorAnterior: 'atendimento', valorNovo: 'gestor' }).details, 'atendimento → gestor');
});
