import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistrationLinkUrl, getRegistrationLinkEffectiveStatus, getRegistrationLinkWarnings, normalizeRegistrationLinkConfig, normalizeRegistrationLinkEdit } from '../src/utils/registrationLink.js';

test('normaliza links para Membro completo e Consulente simplificado', () => {
  assert.equal(normalizeRegistrationLinkConfig({ tipoCadastro: 'membro', nome: ' Membros ', validadeDias: '30', limiteUsos: '20' }).tipoCadastro, 'membro');
  assert.deepEqual(normalizeRegistrationLinkConfig({ tipoCadastro: 'consulente', nome: 'Consulentes', validadeDias: '', limiteUsos: '' }), { tipoCadastro: 'consulente', nome: 'Consulentes', validadeDias: null, limiteUsos: null });
});

test('rejeita configurações fora dos limites seguros', () => {
  assert.throws(() => normalizeRegistrationLinkConfig({ tipoCadastro: 'outro', nome: 'Teste' }), /TIPO_LINK_INVALIDO/);
  assert.throws(() => normalizeRegistrationLinkConfig({ tipoCadastro: 'membro', nome: '', validadeDias: '' }), /NOME_LINK_INVALIDO/);
  assert.throws(() => normalizeRegistrationLinkConfig({ tipoCadastro: 'membro', nome: 'Teste', validadeDias: 366 }), /VALIDADE_LINK_INVALIDA/);
});

test('normaliza edição e impede limite menor que o histórico de usos', () => {
  assert.deepEqual(normalizeRegistrationLinkEdit({ nome: ' Link atualizado ', validadeDias: '15', limiteUsos: '25' }, 20), { nome: 'Link atualizado', validadeDias: 15, limiteUsos: 25 });
  assert.throws(() => normalizeRegistrationLinkEdit({ nome: 'Link', validadeDias: '', limiteUsos: '19' }, 20), /LIMITE_INFERIOR_AOS_USOS/);
});

test('identifica estados efetivos e monta endereço sem dados pessoais', () => {
  assert.equal(getRegistrationLinkEffectiveStatus({ status: 'ativo' }), 'ativo');
  assert.equal(getRegistrationLinkEffectiveStatus({ status: 'inativo' }), 'inativo');
  assert.equal(getRegistrationLinkEffectiveStatus({ status: 'ativo', expiraEm: { toMillis: () => 99 } }, 100), 'expirado');
  assert.equal(getRegistrationLinkEffectiveStatus({ status: 'ativo', limiteUsos: 2, totalUsos: 2 }), 'esgotado');
  const id = 'a'.repeat(64);
  assert.equal(buildRegistrationLinkUrl(id, 'https://hml.exemplo/'), `https://hml.exemplo/autocadastro?link=${id}`);
  assert.throws(() => buildRegistrationLinkUrl('curto', 'https://hml.exemplo'), /LINK_CADASTRO_INVALIDO/);
});

test('avisa sobre expiração e limite próximos ou já atingidos', () => {
  const now = 1000;
  assert.match(getRegistrationLinkWarnings({ status: 'ativo', expiraEm: { toMillis: () => now + 86400000 } }, now)[0].message, /1 dia/);
  assert.match(getRegistrationLinkWarnings({ status: 'ativo', limiteUsos: 10, totalUsos: 8 }, now)[0].message, /2 usos/);
  assert.equal(getRegistrationLinkWarnings({ status: 'ativo', limiteUsos: 10, totalUsos: 10 }, now)[0].type, 'limit');
  assert.equal(getRegistrationLinkWarnings({ status: 'ativo', expiraEm: { toMillis: () => now } }, now)[0].type, 'expired');
  assert.deepEqual(getRegistrationLinkWarnings({ status: 'ativo', limiteUsos: 10, totalUsos: 2 }, now), []);
});
