import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditCsv, describeAuditEvent, filterAuditEvents, getAuditCategory, getAuditChanges, getAuditFieldDetails, getAuditOrigin, getAuditReferences, paginateAuditEvents } from '../src/utils/auditCenter.js';

test('classifica e descreve os principais eventos de auditoria', () => {
  assert.equal(getAuditCategory('USUARIO_ROLE_ALTERADO'), 'acesso');
  assert.equal(getAuditCategory('ATENDIMENTO_SERVICOS_ALTERADOS'), 'atendimento');
  assert.equal(getAuditCategory('AGENDA_EDITADA'), 'agenda');
  assert.equal(describeAuditEvent({ tipo: 'STATUS_ATENDIMENTO_CORRIGIDO', statusAnterior: 'Concluído', statusNovo: 'Presente' }).detail, 'Concluído → Presente');
});

test('filtra auditoria por categoria, período e busca', () => {
  const now = Date.UTC(2026, 8, 20);
  const events = [{ id: 'a', category: 'acesso', tipo: 'A', timestamp: now - 86400000, searchText: 'maria admin' }, { id: 'b', category: 'agenda', tipo: 'B', timestamp: now - 40 * 86400000, searchText: 'joao' }];
  assert.deepEqual(filterAuditEvents(events, { category: 'acesso', period: '30', search: 'maria', now }).map(item => item.id), ['a']);
});

test('pagina auditoria em 10, 20, 50 ou 100 registros', () => {
  const events = Array.from({ length: 27 }, (_, index) => ({ id: index + 1 }));
  assert.deepEqual(paginateAuditEvents(events, 2, 10), { items: events.slice(10, 20), currentPage: 2, totalPages: 3, start: 11, end: 20, total: 27 });
  assert.equal(paginateAuditEvents(events, 1, 20).items.length, 20);
  assert.equal(paginateAuditEvents(events, 9, 50).currentPage, 1);
  assert.equal(paginateAuditEvents(events, 1, 15).items.length, 10);
});

test('filtra por responsável e intervalo personalizado inclusivo', () => {
  const events = [
    { id: 'a', category: 'acesso', tipo: 'A', responsibleId: 'admin-a', timestamp: new Date('2026-09-10T12:00:00').getTime(), searchText: '' },
    { id: 'b', category: 'acesso', tipo: 'A', responsibleId: 'admin-b', timestamp: new Date('2026-09-11T12:00:00').getTime(), searchText: '' },
  ];
  assert.deepEqual(filterAuditEvents(events, { period: 'personalizado', responsible: 'admin-a', startDate: '2026-09-10', endDate: '2026-09-10' }).map(item => item.id), ['a']);
});

test('apresenta alterações e exporta CSV seguro', () => {
  assert.deepEqual(getAuditChanges({ valorAnterior: 'atendimento', valorNovo: 'gestor' }), [{ label: 'Valor', before: 'atendimento', after: 'gestor' }]);
  const csv = buildAuditCsv([{ title: '=alteração', subject: 'Maria', responsible: 'Admin', category: 'acesso', dateText: '20/09/2026', valorAnterior: false, valorNovo: true }]);
  assert.match(csv, /'=alteração/);
  assert.match(csv, /"Não";"Sim"/);
});

test('prefere nomes amigáveis na comparação', () => {
  assert.deepEqual(getAuditChanges({ valorAnterior: 'atendimento', valorNovo: 'admin', valorAnteriorLabel: 'Atendimento / Recepção', valorNovoLabel: 'Administrador', changeLabel: 'Perfil' }), [{ label: 'Perfil', before: 'Atendimento / Recepção', after: 'Administrador' }]);
  assert.deepEqual(getAuditChanges({ servicosAnteriores: ['id-a'], servicosNovos: ['id-b'], servicosAnterioresNomes: ['Passe'], servicosNovosNomes: ['Consulta'] }), [{ label: 'Serviços', before: 'Passe', after: 'Consulta' }]);
});

test('detalha origem, campos e registros relacionados sem inventar valores', () => {
  assert.equal(getAuditOrigin('STATUS_ATENDIMENTO_CORRIGIDO'), 'Fluxo do Dia');
  assert.equal(getAuditOrigin('USUARIO_ROLE_ALTERADO'), 'Usuários e acessos');
  assert.deepEqual(getAuditFieldDetails({ camposAlterados: ['nome', 'dataNascimento'] }), [
    { field: 'nome', label: 'Nome', before: undefined, after: undefined, hasValues: false },
    { field: 'dataNascimento', label: 'Data de nascimento', before: undefined, after: undefined, hasValues: false },
  ]);
  assert.deepEqual(getAuditReferences({ personId: 'p-1', agendaId: 'a-1', agendamentoId: 'at-1' }), [
    { label: 'Pessoa', value: 'p-1' }, { label: 'Agenda', value: 'a-1' }, { label: 'Atendimento', value: 'at-1' },
  ]);
});
