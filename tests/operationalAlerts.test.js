import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationalAlerts, isRegistrationOverdue, summarizeBookPendingItems } from '../src/utils/operationalAlerts.js';

test('identifica somente solicitações pendentes há pelo menos 48 horas', () => {
  const now = Date.UTC(2026, 8, 20, 12);
  assert.equal(isRegistrationOverdue({ statusCadastro: 'aguardando_validacao', criadoEm: now - 49 * 3600000 }, now), true);
  assert.equal(isRegistrationOverdue({ statusCadastro: 'aguardando_validacao', criadoEm: now - 2 * 3600000 }, now), false);
  assert.equal(isRegistrationOverdue({ statusCadastro: 'aprovado', criadoEm: now - 72 * 3600000 }, now), false);
});

test('ordena alertas operacionais pela prioridade', () => {
  const alerts = buildOperationalAlerts({ overdueRegistrations: 2, communicationFailures: 1, pendingUsers: 3 });
  assert.deepEqual(alerts.map(item => item.action), ['communications', 'registrations', 'users']);
  assert.equal(buildOperationalAlerts({}).length, 0);
});

test('resume somente pendências reais do Livro Mediúnico e prioriza o mês mais antigo', () => {
  const volumes = [
    { id: 'empty', competencia: '2026-01', status: 'encerrado', quantidadeRegistros: 0 },
    { id: 'recent', competencia: '2026-09', status: 'encerrado', quantidadeRegistros: 1 },
    { id: 'old', competencia: '2026-07', status: 'encerrado', quantidadeRegistros: 1 },
    { id: 'signed', competencia: '2026-06', status: 'arquivado', quantidadeRegistros: 1 },
  ];
  const records = [
    { volumeId: 'recent', atendimentos: [{ nome: 'Ana', servicos: [{ nome: 'Passe' }], status: 'Concluído', horaChegada: 1, horaConclusao: 2 }] },
    { volumeId: 'old', atendimentos: [{ nome: 'Bia', servicos: [], status: 'Concluído', horaChegada: 1, horaConclusao: 2 }] },
    { volumeId: 'signed' },
  ];
  assert.deepEqual(summarizeBookPendingItems(volumes, records), { unsignedCount: 2, oldestUnsignedCompetence: '2026-07', incompleteCount: 1, automaticClosureFailures: 0 });
  const alerts = buildOperationalAlerts({ bookUnsignedVolumes: 2, bookOldestUnsignedCompetence: '2026-07', bookIncompleteRecords: 1 });
  assert.deepEqual(alerts.map(item => item.action), ['book', 'book']);
  assert.match(alerts[1].description, /07\/2026/);
});

test('prioriza falha do fechamento mensal automático', () => {
  const summary = summarizeBookPendingItems([{ id: 'open', competencia: '2026-09', status: 'aberto', quantidadeRegistros: 1, fechamentoAutomaticoErro: { codigo: 'FALHA' } }], []);
  assert.equal(summary.automaticClosureFailures, 1);
  const alerts = buildOperationalAlerts({ bookAutomaticClosureFailures: 1, bookUnsignedVolumes: 2 });
  assert.equal(alerts[0].id, 'book-automatic-closure-failures');
});

test('prioriza falha de backup acima das demais pendências', () => {
  const alerts = buildOperationalAlerts({ backupFailed: true, bookAutomaticClosureFailures: 1 });
  assert.equal(alerts[0].id, 'system-backup-failure');
  assert.equal(alerts[0].action, 'backup');
});
