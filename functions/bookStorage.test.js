import test from 'node:test';
import assert from 'node:assert/strict';
import { getBookBucketName, verifyBookStorageAccess } from './bookStorage.js';

test('usa bucket exclusivo por ambiente e remove o arquivo de diagnóstico', async () => {
  const calls = []; const file = { save: async () => calls.push('save'), exists: async () => [true], getSignedUrl: async () => ['https://signed.test/file'], delete: async () => calls.push('delete') };
  const storage = { bucket: name => ({ name, file: path => { calls.push(path); return file; } }) };
  const result = await verifyBookStorageAccess({ storage, projectId: 'santa-fe-v2-hml' });
  assert.equal(getBookBucketName('santa-fe-v2-hml'), 'santa-fe-v2-hml-livro-mediunico');
  assert.deepEqual(result, { ready: true, bucket: 'santa-fe-v2-hml-livro-mediunico' });
  assert.deepEqual(calls.filter(item => ['save', 'delete'].includes(item)), ['save', 'delete']);
});
