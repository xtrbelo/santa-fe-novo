import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Auditoria carrega eventos recentes em blocos e permite buscar os anteriores', async () => {
  const source = await readFile(new URL('../src/modules/Auditoria/AuditoriaModule.jsx', import.meta.url), 'utf8');
  assert.match(source, /auditBatchSize = 100/);
  assert.match(source, /orderBy\(field, 'desc'\), limit\(auditBatchSize\)/);
  assert.match(source, /startAfter\(auditCursors\[field\]\)/);
  assert.match(source, /Carregar histórico mais antigo/);
  assert.doesNotMatch(source, /onSnapshot\(getAppCollection\('auditoria'\)/);
});
