import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPeople, getMissingPersonFields } from '../src/utils/peopleFilters.js';

const completeMember = { id: 'm1', nome: 'Maria', cpf: '123', contato: '96999999999', email: 'maria@example.test', dataNascimento: '1990-01-01', vinculo: 'membro', ativo: true, funcoesCasa: ['medium'], endereco: { cep: '68900000', logradouro: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Macapá', uf: 'AP' } };

test('identifica campos ausentes conforme o vínculo', () => {
  assert.deepEqual(getMissingPersonFields({ nome: 'Consulente', vinculo: 'consulente' }), ['CPF', 'Contato']);
  assert.deepEqual(getMissingPersonFields(completeMember), []);
  assert.ok(getMissingPersonFields({ ...completeMember, email: null, funcoesCasa: [] }).includes('E-mail'));
});

test('combina vínculo, situação, função e completude', () => {
  const people = [completeMember, { ...completeMember, id: 'm2', ativo: false, funcoesCasa: ['cambone'] }, { id: 'c1', nome: 'Consulente', vinculo: 'consulente', ativo: true }];
  assert.deepEqual(filterPeople(people, { type: 'membro', situation: 'ativos', functionId: 'medium' }).map(item => item.id), ['m1']);
  assert.deepEqual(filterPeople(people, { situation: 'todos', completeness: 'incompletos' }).map(item => item.id), ['c1']);
});
