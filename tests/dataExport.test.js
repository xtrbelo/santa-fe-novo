import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCsv, PEOPLE_EXPORT_COLUMNS } from '../src/utils/dataExport.js';

test('exportação gera CSV compatível com Excel e separador brasileiro', () => {
  const csv = buildCsv(PEOPLE_EXPORT_COLUMNS, [{ nome: 'Maria; Silva', cpf: '123', email: '=perigoso', contato: '999', vinculo: 'membro', funcoesCasa: ['Médium'], ativo: true }]);
  assert.match(csv, /^\uFEFF"Nome";"CPF"/);
  assert.match(csv, /"Maria; Silva"/);
  assert.match(csv, /"'=perigoso"/);
  assert.match(csv, /"Médium"/);
});

test('exportação inclui somente as linhas recebidas após os filtros', () => {
  const csv = buildCsv(PEOPLE_EXPORT_COLUMNS, [{ nome: 'Pessoa visível', ativo: false }]);
  assert.match(csv, /Pessoa visível/);
  assert.match(csv, /Inativo/);
  assert.doesNotMatch(csv, /Pessoa ocultada/);
});
