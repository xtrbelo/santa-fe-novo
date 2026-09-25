import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookAttendances } from '../functions/bookRecord.js';

test('registro do livro mantém somente os dados operacionais necessários', () => {
  const result = buildBookAttendances([{ id: 'a1', nome: 'Maria', cpf: '123', contato: '999', observacao: 'sensível', status: 'Concluído', horaChegada: '19:01', horaSaida: '19:30', servicosIds: ['passe', 'consulta'], servicosNomes: { passe: 'Passe', consulta: 'Consulta' }, servicosRealocados: { consulta: { destinoAgendaId: 'outra' } } }]);
  assert.deepEqual(result[0].servicos, [{ id: 'passe', nome: 'Passe' }]);
  assert.equal(result[0].nome, 'Maria');
  assert.equal(result[0].horaConclusao, '19:30');
  assert.equal(Object.hasOwn(result[0], 'cpf'), false);
  assert.equal(Object.hasOwn(result[0], 'contato'), false);
  assert.equal(Object.hasOwn(result[0], 'observacao'), false);
});
