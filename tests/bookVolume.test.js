import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookVolumeHash, verifyBookVolumeHash } from '../functions/bookVolume.js';

test('hash do volume independe da ordem dos registros e é sensível ao conteúdo', () => {
  const records = [{ id: 'b', agendaId: '2', quantidadeAtendimentos: 3 }, { id: 'a', agendaId: '1', quantidadeAtendimentos: 2 }];
  const first = buildBookVolumeHash({ numero: 1, records });
  const second = buildBookVolumeHash({ numero: 1, records: [...records].reverse() });
  const changed = buildBookVolumeHash({ numero: 1, records: [{ ...records[0], quantidadeAtendimentos: 4 }, records[1]] });
  assert.equal(first, second);
  assert.notEqual(first, changed);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('confere a integridade do volume pelo hash armazenado', () => {
  const records = [{ id: 'a', agendaId: '1', quantidadeAtendimentos: 2 }];
  const expectedHash = buildBookVolumeHash({ numero: 3, records });
  assert.equal(verifyBookVolumeHash({ numero: 3, records, expectedHash }).intact, true);
  assert.equal(verifyBookVolumeHash({ numero: 3, records: [{ ...records[0], quantidadeAtendimentos: 4 }], expectedHash }).intact, false);
  assert.equal(verifyBookVolumeHash({ numero: 3, records }).intact, false);
});
