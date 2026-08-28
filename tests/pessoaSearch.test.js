import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPessoaSearchIndex, buildPessoaSearchTerms, MAX_PESSOA_SEARCH_TERMS, normalizeSearchDigits, normalizeSearchText } from '../src/utils/pessoaSearch.js';

test('normaliza texto com acentos, caixa e espaços', () => {
  assert.equal(normalizeSearchText('  MÁRCIA   Araújo '), 'marcia araujo');
  assert.equal(normalizeSearchText('JOÃO Paulo'), 'joao paulo');
});

test('normaliza CPF e telefone mantendo somente dígitos', () => {
  assert.equal(normalizeSearchDigits('123.456.789-00'), '12345678900');
  assert.equal(normalizeSearchDigits('(96) 99123-4567'), '96991234567');
});

test('gera prefixos de palavras, expressão, CPF e sufixos de telefone sem duplicar', () => {
  const terms = buildPessoaSearchTerms({ nome: 'João Paulo Belo', cpf: '123.456.789-00', contato: '(96) 99123-4567' });
  for (const expected of ['joa', 'joao', 'paulo', 'belo', 'joao pa', '12345678900', '96991234567', '991234567', '4567']) {
    assert.ok(terms.includes(expected), `termo ausente: ${expected}`);
  }
  assert.equal(terms.length, new Set(terms).size);
  assert.ok(terms.length <= MAX_PESSOA_SEARCH_TERMS);
});

test('índice é versionado e limitado mesmo com nome grande', () => {
  const index = buildPessoaSearchIndex({ nome: Array.from({ length: 100 }, (_, i) => `Palavra${i}`).join(' ') });
  assert.equal(index.versao, 1);
  assert.ok(index.termos.length <= MAX_PESSOA_SEARCH_TERMS);
});
