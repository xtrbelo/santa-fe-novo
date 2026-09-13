import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAdminContinuity, isActiveAdmin, requiresActiveMember, requiresAdminCount, resolveProjectId } from './adminPolicy.js';

test('bloqueia remoção ou revogação do último administrador ativo', () => {
  const target = { role: 'admin', ativo: true };
  assert.equal(requiresAdminCount(target, { role: 'gestor', ativo: true }), true);
  assert.throws(() => assertAdminContinuity({ target, next: { role: 'gestor', ativo: true }, activeAdminCount: 1 }), /ULTIMO_ADMINISTRADOR/);
  assert.throws(() => assertAdminContinuity({ target, next: { role: 'admin', ativo: false }, activeAdminCount: 1 }), /ULTIMO_ADMINISTRADOR/);
});

test('permite alteração quando outro administrador ativo permanece', () => {
  assert.doesNotThrow(() => assertAdminContinuity({ target: { role: 'admin', ativo: true }, next: { role: 'gestor', ativo: true }, activeAdminCount: 2 }));
  assert.equal(requiresAdminCount({ role: 'gestor', ativo: true }, { role: 'atendimento', ativo: true }), false);
});

test('considera administrador legado sem campo ativo como ativo', () => {
  assert.equal(isActiveAdmin({ role: 'admin' }), true);
  assert.equal(isActiveAdmin({ role: 'admin', ativo: false }), false);
  assert.equal(requiresAdminCount({ role: 'admin' }, { role: 'gestor' }), true);
});

test('resolve projeto pelo ambiente quando o app não expõe projectId', () => {
  assert.equal(resolveProjectId({ appProjectId: undefined, googleCloudProject: 'santa-fe-v2-hml' }), 'santa-fe-v2-hml');
  assert.equal(resolveProjectId({ appProjectId: 'app-project', googleCloudProject: 'env-project' }), 'app-project');
});

test('valida membro ativo em alteração de perfil e reativação vinculadas', () => {
  const target = { pessoaBaseId: 'membro-1' };
  assert.equal(requiresActiveMember({ action: 'role', target }), true);
  assert.equal(requiresActiveMember({ action: 'active', target, active: true }), true);
  assert.equal(requiresActiveMember({ action: 'active', target, active: false }), false);
  assert.equal(requiresActiveMember({ action: 'role', target: {} }), false);
});
