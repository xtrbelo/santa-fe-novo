import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAppointments, generateWeeklyRecurrence, getAgendaSchedulingKey, getAvailableAgendas, selectQuickRegisteredPerson } from '../src/utils/agendaScheduling.js';

const now = new Date('2030-01-10T10:00:00');
const stamp = value => ({ toDate: () => new Date(value) });
const service = { id: 'passe', nome: 'Passe', ativo: true, controlaVagas: true };
const agenda = (id, overrides = {}) => ({ id, data: stamp('2030-01-11T12:00:00'), ativo: true, status: 'Agendada', servicosIds: ['passe'], servicosStatus: { passe: 'Ativo' }, publicosPermitidos: ['consulente'], vagasTotais: { passe: 2 }, vagasOcupadas: { passe: 0 }, ...overrides });

test('serviço sem data e filtro por serviço', () => {
  assert.deepEqual(getAvailableAgendas({ agendas: [agenda('outra', { servicosIds: ['consulta'] })], service, now }), []);
  assert.deepEqual(getAvailableAgendas({ agendas: [agenda('ok'), agenda('outra', { servicosIds: ['consulta'] })], service, now }).map(item => item.id), ['ok']);
});

test('filtra pelo público e exige pessoa ativa', () => {
  assert.deepEqual(getAvailableAgendas({ agendas: [agenda('restrita')], service, pessoa: { id: 'm', ativo: true, vinculo: 'membro' }, now }), []);
  assert.deepEqual(getAvailableAgendas({ agendas: [agenda('restrita')], service, pessoa: { id: 'c', ativo: false, vinculo: 'consulente' }, now }), []);
});

test('exclui agenda cancelada, concluída, serviço cancelado e agenda sem vaga', () => {
  const items = [agenda('cancelada', { status: 'Cancelada' }), agenda('concluida', { status: 'Concluída' }), agenda('servico-cancelado', { servicosStatus: { passe: 'Cancelado' } }), agenda('lotada', { vagasOcupadas: { passe: 2 } })];
  assert.deepEqual(getAvailableAgendas({ agendas: items, service, now }), []);
});

test('ordena datas e mantém agenda legada compatível', () => {
  const legacy = agenda('legada', { data: stamp('2030-01-12T12:00:00'), servicosIds: undefined, servicosStatus: undefined, publicosPermitidos: undefined });
  assert.deepEqual(getAvailableAgendas({ agendas: [legacy, agenda('primeira')], service, now }).map(item => item.id), ['primeira', 'legada']);
});

test('chave de programação independe da ordem e filtros preservam histórico', () => {
  const a = getAgendaSchedulingKey({ tipoTrabalhoId: 't', date: '2030-01-11', horario: '12:00', servicosIds: ['b', 'a'], publicosPermitidos: ['membro', 'consulente'] });
  const b = getAgendaSchedulingKey({ tipoTrabalhoId: 't', date: '2030-01-11', horario: '12:00', servicosIds: ['a', 'b'], publicosPermitidos: ['consulente', 'membro'] });
  assert.equal(a, b);
  assert.equal(filterAppointments([{ agendaId: 'legada', status: 'Concluído', servicosIds: ['a', 'b'] }], {}, 'todos', now).length, 1);
});

test('recorrência semanal é inclusiva e gera todas as quartas-feiras', () => {
  assert.deepEqual(generateWeeklyRecurrence({ weekday: 3, startDate: '2026-09-02', endDate: '2026-09-30', today: new Date('2026-09-01') }), ['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30']);
});

test('início fora do dia escolhido avança para a primeira ocorrência', () => {
  assert.deepEqual(generateWeeklyRecurrence({ weekday: 3, startDate: '2026-09-03', endDate: '2026-09-16', today: new Date('2026-09-01') }), ['2026-09-09', '2026-09-16']);
});

test('recusa período sem ocorrência, final anterior e datas passadas', () => {
  assert.throws(() => generateWeeklyRecurrence({ weekday: 3, startDate: '2026-09-03', endDate: '2026-09-08', today: new Date('2026-09-01') }), /RECORRENCIA_SEM_OCORRENCIA/);
  assert.throws(() => generateWeeklyRecurrence({ weekday: 3, startDate: '2026-09-10', endDate: '2026-09-01', today: new Date('2026-09-01') }), /DATA_FINAL_ANTERIOR/);
  assert.throws(() => generateWeeklyRecurrence({ weekday: 3, startDate: '2026-08-01', endDate: '2026-09-02', today: new Date('2026-09-01') }), /PROGRAMACAO_DATA_PASSADA/);
});

test('cadastro rápido seleciona a Pessoa sem perder Serviço e revalida público', () => {
  const selectedService = { ...service }; const pessoa = { id: 'nova', nome: 'Nova', ativo: true, vinculo: 'consulente' };
  const next = selectQuickRegisteredPerson({ service: selectedService, pessoa: null, agenda: agenda('anterior') }, pessoa);
  assert.equal(next.service, selectedService); assert.equal(next.pessoa, pessoa); assert.equal(next.agenda, null);
  assert.equal(getAvailableAgendas({ agendas: [agenda('permitida'), agenda('membros', { publicosPermitidos: ['membro'] })], service: selectedService, pessoa, now }).length, 1);
});
