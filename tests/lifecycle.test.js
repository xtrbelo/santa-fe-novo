import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { LIFECYCLE_AUDIT_TYPES, requireLifecycleReason } from '../src/utils/lifecycle.js';

describe('lifecycle 9H', () => {
  test('normaliza motivo obrigatório', () => assert.equal(requireLifecycleReason('  Afastamento institucional  '), 'Afastamento institucional'));
  test('rejeita motivo vazio ou excessivo', () => {
    assert.throws(() => requireLifecycleReason('  '), /MOTIVO_OBRIGATORIO/);
    assert.throws(() => requireLifecycleReason('x'.repeat(501)), /MOTIVO_MUITO_LONGO/);
  });
  test('define os quatro eventos institucionais', () => assert.deepEqual(Object.values(LIFECYCLE_AUDIT_TYPES), ['MEMBRO_INATIVADO', 'MEMBRO_REATIVADO', 'USUARIO_ACESSO_REVOGADO', 'USUARIO_ACESSO_REATIVADO']));
});
