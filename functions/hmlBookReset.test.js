import test from 'node:test';
import assert from 'node:assert/strict';
import { canResetArchivedBookInHml } from './hmlBookReset.js';

test('reset de volume é exclusivo de administrador no HML e de volume arquivado', () => {
  assert.equal(canResetArchivedBookInHml({ projectId: 'santa-fe-v2-hml', status: 'arquivado', isAdmin: true }), true);
  assert.equal(canResetArchivedBookInHml({ projectId: 'santa-fe-v2-prod', status: 'arquivado', isAdmin: true }), false);
  assert.equal(canResetArchivedBookInHml({ projectId: 'santa-fe-v2-hml', status: 'arquivado', isAdmin: false }), false);
  assert.equal(canResetArchivedBookInHml({ projectId: 'santa-fe-v2-hml', status: 'encerrado', isAdmin: true }), false);
});
