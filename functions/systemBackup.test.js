import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { buildBackupArchive, getBackupBucketName, isBackupStatusStale } from './systemBackup.js';

test('usa bucket exclusivo por ambiente', () => assert.equal(getBackupBucketName('santa-fe-v2-hml'), 'santa-fe-v2-hml-backups'));

test('gera arquivo compactado com contagem e hash', () => {
  const result = buildBackupArchive({ projectId: 'hml', createdAt: '2026-09-25T03:00:00.000Z', collections: [{ path: 'pessoas', documents: [{ id: '1', data: { nome: 'Ana' } }] }] });
  const payload = JSON.parse(gunzipSync(result.archive).toString());
  assert.equal(result.documentCount, 1);
  assert.equal(result.sha256.length, 64);
  assert.equal(payload.collections[0].documents[0].data.nome, 'Ana');
});

test('identifica backup ausente ou atrasado', () => {
  const now = Date.parse('2026-09-25T15:00:00.000Z');
  assert.equal(isBackupStatusStale(null, now), true);
  assert.equal(isBackupStatusStale('2026-09-25T03:00:00.000Z', now), false);
  assert.equal(isBackupStatusStale('2026-09-23T00:00:00.000Z', now), true);
});
