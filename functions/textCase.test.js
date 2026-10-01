import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCollectionPatch, normalizeCollectionData, normalizeDisplayName } from './textCase.js';

test('normaliza documentos de Pessoa sem modificar campos técnicos', () => {
  const source = { nome: 'JOÃO DA SILVA', email: 'JOAO@EXEMPLO.COM', ativo: true, cpf: '123' };
  const normalized = normalizeCollectionData('pessoas', source);
  assert.equal(normalized.nome, 'João da Silva');
  assert.equal(normalized.email, 'joao@exemplo.com');
  assert.equal(normalized.ativo, true);
  assert.equal(normalized.cpf, '123');
  assert.equal(normalized.busca.nome, 'joao da silva');
});

test('normaliza configurações e preserva observações e estados', () => {
  const source = { nome: 'SERVIÇO DE PASSES', status: 'ativo', observacao: 'Texto livre preservado' };
  assert.deepEqual(buildCollectionPatch('config_servicos', source), { nome: 'Serviço de Passes' });
});

test('normaliza nomes com acentos no backend', () => {
  assert.equal(normalizeDisplayName('MÉDIUM DA CASA'), 'Médium da Casa');
});

test('preserva campos textuais nulos durante a migração', () => {
  const normalized = normalizeCollectionData('pessoas', { nome: 'MARIA', email: null, endereco: null });
  assert.equal(normalized.email, null);
  assert.equal(normalized.endereco, null);
});
