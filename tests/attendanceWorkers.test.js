import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceWorkerGroups } from '../src/utils/attendanceWorkers.js';
import { validateAttendanceWorkers, validateDayCanClose } from '../functions/attendanceWorkers.js';
import { getScheduledWorkerIds } from '../functions/workGroups.js';
import { getScheduledWorkerGroups } from '../src/utils/workGroups.js';

const configurations = [{ id: 'medium', nome: 'Médium' }, { id: 'cambone', nome: 'Cambone' }];
const people = [
  { id: 'm1', nome: 'Ana', vinculo: 'membro', ativo: true, funcoesCasa: ['medium'] },
  { id: 'c1', nome: 'Bia', vinculo: 'membro', ativo: true, funcoesCasa: ['cambone'] },
  { id: 'both', nome: 'Caio', vinculo: 'membro', ativo: true, funcoesCasa: ['medium', 'cambone'] },
  { id: 'inactive', nome: 'Dora', vinculo: 'membro', ativo: false, funcoesCasa: ['medium'] },
];

test('lista somente membros ativos na função correspondente', () => {
  const groups = buildAttendanceWorkerGroups(people, configurations);
  assert.deepEqual(groups.mediuns.map(item => item.id), ['m1', 'both']);
  assert.deepEqual(groups.cambones.map(item => item.id), ['c1', 'both']);
});

test('valida e normaliza a equipe participante', () => {
  const workers = validateAttendanceWorkers({ mediunsIds: ['m1'], cambonesIds: ['c1'], peopleById: Object.fromEntries(people.map(item => [item.id, item])), configurations });
  assert.deepEqual(workers.map(item => [item.pessoaBaseId, item.funcao]), [['m1', 'medium'], ['c1', 'cambone']]);
});

test('recusa equipe vazia, membro inativo, função incorreta e duplicidade de papel', () => {
  const peopleById = Object.fromEntries(people.map(item => [item.id, item]));
  assert.throws(() => validateAttendanceWorkers({ peopleById, configurations }), /TRABALHADOR_OBRIGATORIO/);
  assert.throws(() => validateAttendanceWorkers({ mediunsIds: ['inactive'], peopleById, configurations }), /TRABALHADOR_INVALIDO/);
  assert.throws(() => validateAttendanceWorkers({ mediunsIds: ['c1'], peopleById, configurations }), /FUNCAO_TRABALHADOR_INVALIDA/);
  assert.throws(() => validateAttendanceWorkers({ mediunsIds: ['both'], cambonesIds: ['both'], peopleById, configurations }), /FUNCAO_TRABALHADOR_AMBIGUA/);
});

test('fechamento do dia exige atendimentos existentes e todos encerrados', () => {
  assert.equal(validateDayCanClose([{ status: 'Concluído' }, { status: 'Faltou' }, { status: 'Cancelado' }]), true);
  assert.throws(() => validateDayCanClose([]), /ATENDIMENTOS_AUSENTES/);
  assert.throws(() => validateDayCanClose([{ status: 'Concluído' }, { status: 'Presente' }]), /ATENDIMENTOS_PENDENTES/);
  assert.throws(() => validateDayCanClose([{ status: 'Agendado' }]), /ATENDIMENTOS_PENDENTES/);
  assert.equal(validateDayCanClose([{ status: 'Presente' }], { attendanceOnly: true }), true);
  assert.throws(() => validateDayCanClose([{ status: 'Agendado' }], { attendanceOnly: true }), /ATENDIMENTOS_PENDENTES/);
});

test('identifica automaticamente a turma pelo dia da agenda', () => {
  const agendaDate = new Date('2026-09-21T15:00:00.000Z');
  const groups = [{ id: 'segunda', nome: 'Turma de Segunda', ativo: true, diasSemana: [1], mediunsIds: ['m1'], cambonesIds: ['c1'] }, { id: 'terca', ativo: true, diasSemana: [2], mediunsIds: ['both'] }];
  const scheduled = getScheduledWorkerGroups({ agendaDate, groups, workers: buildAttendanceWorkerGroups(people, configurations) });
  assert.deepEqual(scheduled.groups.map(item => item.id), ['segunda']);
  assert.deepEqual(scheduled.mediuns.map(item => item.id), ['m1']);
  assert.deepEqual(scheduled.cambones.map(item => item.id), ['c1']);
  const secure = getScheduledWorkerIds({ agendaDate, groups });
  assert.equal(secure.mediuns.has('m1'), true);
  assert.equal(secure.mediuns.has('both'), false);
});

test('recusa fechamento quando nenhuma turma atende o dia', () => {
  assert.throws(() => getScheduledWorkerIds({ agendaDate: new Date('2026-09-21T15:00:00.000Z'), groups: [{ diasSemana: [2], ativo: true }] }), /TURMA_NAO_CONFIGURADA/);
});
