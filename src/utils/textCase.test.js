import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAddressText, normalizeDisplayName, normalizeDisplayText, normalizeEmailText } from './textCase.js';

test('normaliza nomes em caixa de título e preserva partículas portuguesas', () => {
  assert.equal(normalizeDisplayName('  MARIA   DA silva santos '), 'Maria da Silva Santos');
  assert.equal(normalizeDisplayName("joão d'ávila"), "João D'Ávila");
});

test('normaliza textos exibidos sem alterar o conteúdo semântico', () => {
  assert.equal(normalizeDisplayText('  ATENDIMENTO   ESPIRITUAL '), 'Atendimento Espiritual');
  assert.equal(normalizeDisplayText(''), '');
});

test('normaliza e-mail separadamente e endereço por campo', () => {
  assert.equal(normalizeEmailText('  Pessoa@EXEMPLO.COM '), 'pessoa@exemplo.com');
  assert.deepEqual(normalizeAddressText({ logradouro: ' RUA DAS FLORES ', numero: ' 12 ', bairro: 'CENTRO', cidade: 'são paulo', uf: 'sp', cep: '01000000' }), {
    logradouro: 'Rua das Flores', numero: '12', complemento: null, bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', cep: '01000000',
  });
});
