import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemHealthSummary } from '../src/utils/systemHealth.js';

test('classifica diagnóstico saudável quando não há pendências', () => {
  const result = buildSystemHealthSummary({ access: { analyzed: 3, issues: [], orphanIndexes: [], emailConflicts: [] }, memberEmail: { analyzed: 8, missing: [], conflicts: [], indexConflicts: [], invalid: [], orphanIndexes: [] }, cpf: { analyzed: 10, missing: [], conflicts: [], invalid: 0 }, vacancies: { analyzed: 4, divergences: [] } });
  assert.equal(result.healthy, true);
  assert.equal(result.critical, 0);
  assert.equal(result.warning, 0);
});

test('separa situações críticas de avisos reparáveis', () => {
  const result = buildSystemHealthSummary({ access: { analyzed: 2, issues: [{}], orphanIndexes: [{}], emailConflicts: [{}] }, memberEmail: { analyzed: 4, missing: [{}], conflicts: [{}], indexConflicts: [{}], invalid: [{}], orphanIndexes: [{}] }, cpf: { analyzed: 5, missing: [{}, {}], conflicts: [{}], invalid: 1 }, vacancies: { analyzed: 3, divergences: [{}, {}] } });
  assert.equal(result.healthy, false);
  assert.equal(result.critical, 6);
  assert.equal(result.warning, 8);
});
