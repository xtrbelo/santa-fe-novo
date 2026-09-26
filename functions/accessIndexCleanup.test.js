import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrphanAccessIndexReason } from './accessIndexCleanup.js';

test('classifica somente índices realmente órfãos', () => {
  assert.equal(getOrphanAccessIndexReason({ personExists: false, userExists: true, userPessoaBaseId: 'p1', pessoaBaseId: 'p1' }), 'PESSOA_INEXISTENTE');
  assert.equal(getOrphanAccessIndexReason({ personExists: true, userExists: false, userPessoaBaseId: null, pessoaBaseId: 'p1' }), 'USUARIO_INEXISTENTE');
  assert.equal(getOrphanAccessIndexReason({ personExists: true, userExists: true, userPessoaBaseId: 'p2', pessoaBaseId: 'p1' }), 'VINCULO_DIVERGENTE');
  assert.equal(getOrphanAccessIndexReason({ personExists: true, userExists: true, userPessoaBaseId: 'p1', pessoaBaseId: 'p1' }), null);
});
