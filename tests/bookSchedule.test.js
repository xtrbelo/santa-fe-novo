import test from 'node:test';
import assert from 'node:assert/strict';
import { getBookCompetence, isPreviousOpenBookVolume } from '../functions/bookSchedule.js';

test('identifica somente volumes abertos de competências anteriores', () => {
  assert.equal(getBookCompetence(new Date('2026-10-01T12:00:00.000Z')), '2026-10');
  assert.equal(isPreviousOpenBookVolume({ status: 'aberto', competencia: '2026-09' }, '2026-10'), true);
  assert.equal(isPreviousOpenBookVolume({ status: 'aberto', competencia: '2026-10' }, '2026-10'), false);
  assert.equal(isPreviousOpenBookVolume({ status: 'encerrado', competencia: '2026-09' }, '2026-10'), false);
  assert.equal(isPreviousOpenBookVolume({ status: 'aberto' }, '2026-10'), false);
});
