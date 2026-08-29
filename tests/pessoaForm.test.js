import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPessoaPayload, getEffectiveMemberFunctions, getMemberFunctionLabels, localTextIncludes, normalizeEmail, validatePessoaPayload } from '../src/utils/pessoaForm.js';

test('cria Membro no modelo atual com e-mail normalizado e múltiplas funções', () => {
  const pessoa = buildPessoaPayload({ vinculo: 'membro', nome: ' Maria ', cpf: '123', email: ' MARIA@EMAIL.COM ', funcoesCasa: ['medium', 'cambone', 'medium'] });
  assert.equal(pessoa.vinculo, 'membro'); assert.equal(pessoa.tipoPessoa, 'Membro');
  assert.equal(pessoa.email, 'maria@email.com'); assert.deepEqual(pessoa.funcoesCasa, ['medium', 'cambone']);
  assert.equal(validatePessoaPayload(pessoa), null);
});

test('Consulente mantém e-mail opcional e não recebe funções', () => {
  const pessoa = buildPessoaPayload({ vinculo: 'consulente', nome: 'Ana', funcoesCasa: ['medium'] });
  assert.equal(pessoa.tipoPessoa, 'Consulente'); assert.equal(pessoa.email, null); assert.deepEqual(pessoa.funcoesCasa, []);
});

test('Membro exige CPF, e-mail e formato válido', () => {
  assert.match(validatePessoaPayload({ vinculo: 'membro', nome: 'A', email: 'a@b.com' }), /CPF/);
  assert.match(validatePessoaPayload({ vinculo: 'membro', nome: 'A', cpf: '1' }), /e-mail/);
  assert.match(validatePessoaPayload({ vinculo: 'membro', nome: 'A', cpf: '1', email: 'inválido' }), /válido/);
});

test('busca local ignora acentos, caixa e espaços extras', () => {
  assert.equal(localTextIncludes('João Paulo Belo', 'joao'), true);
  assert.equal(localTextIncludes('João Paulo Belo', ' JOÃO   PAULO '), true);
  assert.equal(localTextIncludes('JOÃO   PAULO', 'joao paulo'), true);
  assert.equal(normalizeEmail(' JOAO@EMAIL.COM '), 'joao@email.com');
});

test('funções efetivas sempre incluem Médium e Cambone e acrescentam personalizadas', () => {
  assert.deepEqual(getEffectiveMemberFunctions([]).map(item => item.nome), ['Médium', 'Cambone']);
  assert.deepEqual(getEffectiveMemberFunctions([{ codigo: 'dirigente', nome: 'Dirigente', ativo: true }]).map(item => item.nome), ['Médium', 'Cambone', 'Dirigente']);
});

test('funções efetivas ignoram inativas e configuração substitui nome sem duplicar código', () => {
  const effective = getEffectiveMemberFunctions([{ codigo: 'medium', nome: 'Médium da Casa', ativo: true }, { codigo: 'inativa', nome: 'Inativa', ativo: false }]);
  assert.deepEqual(effective.map(item => item.id), ['medium', 'cambone']);
  assert.deepEqual(getMemberFunctionLabels(['medium', 'cambone'], effective), ['Médium da Casa', 'Cambone']);
});

test('label de função personalizada usa o nome configurado', () => {
  assert.deepEqual(getMemberFunctionLabels(['dirigente'], [{ codigo: 'dirigente', nome: 'Dirigente' }]), ['Dirigente']);
});
