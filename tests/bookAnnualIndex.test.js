import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookAnnualIndex } from '../src/utils/bookAnnualIndex.js';

test('monta índice anual e libera definitivo somente com volumes assinados', () => {
  const volumes = [{ id: 'jan', competencia: '2026-01', status: 'arquivado', quantidadeAtendimentos: 8, codigoVerificacao: 'ABC' }, { id: 'fev', competencia: '2026-02', status: 'encerrado', quantidadeRegistros: 1, quantidadeAtendimentos: 4 }];
  const records = [{ id: 'r1', volumeId: 'jan' }, { id: 'r2', volumeId: 'jan' }];
  const summary = buildBookAnnualIndex({ year: 2026, volumes, records });
  assert.equal(summary.months.length, 12);
  assert.equal(summary.totalDays, 3);
  assert.equal(summary.totalAttendances, 12);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.definitiveReady, false);
  assert.equal(summary.months[2].status, 'sem_movimento');
  assert.equal(buildBookAnnualIndex({ year: 2026, volumes: [{ ...volumes[0] }], records }).definitiveReady, true);
  assert.equal(buildBookAnnualIndex({ year: 2026 }).definitiveReady, false);
});
