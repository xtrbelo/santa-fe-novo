import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAdminContinuity, isActiveAdmin, requiresActiveMember, requiresAdminCount, resolveProjectId, validateAccessAuthorizationCreation, validateUserPersonLinkChange } from './adminPolicy.js';

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

test('permite reparar vínculo órfão com membro ativo do mesmo e-mail', () => {
  const decision = validateUserPersonLinkChange({
    targetUid: 'usuario-1',
    target: { uid: 'usuario-1', role: 'atendimento', email: ' MEMBRO@EXAMPLE.TEST ', pessoaBaseId: 'pessoa-excluida' },
    currentPersonExists: false,
    nextPersonId: 'pessoa-ativa',
    nextPerson: { vinculo: 'membro', ativo: true, email: 'membro@example.test' },
    nextIndex: null,
  });
  assert.deepEqual(decision, { updated: true, repaired: true, previousPessoaBaseId: 'pessoa-excluida' });
});

test('reconstrói índice ausente sem trocar a Pessoa válida', () => {
  const decision = validateUserPersonLinkChange({
    targetUid: 'usuario-1',
    target: { uid: 'usuario-1', role: 'atendimento', email: 'membro@example.test', pessoaBaseId: 'pessoa-1' },
    currentPersonExists: true,
    nextPersonId: 'pessoa-1',
    nextPerson: { vinculo: 'membro', ativo: true, email: 'membro@example.test' },
    nextIndex: null,
  });
  assert.deepEqual(decision, { updated: true, repaired: false, previousPessoaBaseId: 'pessoa-1' });
});

test('não troca vínculo válido nem aceita membro incompatível', () => {
  const base = { targetUid: 'usuario-1', target: { uid: 'usuario-1', role: 'gestor', email: 'membro@example.test', pessoaBaseId: 'pessoa-atual' }, nextPersonId: 'pessoa-nova', nextPerson: { vinculo: 'membro', ativo: true, email: 'membro@example.test' }, nextIndex: null };
  assert.throws(() => validateUserPersonLinkChange({ ...base, currentPersonExists: true }), /USUARIO_JA_VINCULADO/);
  assert.throws(() => validateUserPersonLinkChange({ ...base, currentPersonExists: false, nextPerson: { vinculo: 'consulente', ativo: true, email: 'membro@example.test' } }), /PESSOA_NAO_E_MEMBRO_ATIVO/);
  assert.throws(() => validateUserPersonLinkChange({ ...base, currentPersonExists: false, nextIndex: { uid: 'outro-usuario' } }), /PESSOA_JA_POSSUI_ACESSO/);
  assert.throws(() => validateUserPersonLinkChange({ ...base, currentPersonExists: false, activeEmailMatchIds: ['pessoa-nova', 'pessoa-duplicada'] }), /EMAIL_MEMBRO_AMBIGUO/);
});

test('autoriza acesso somente quando o e-mail identifica um único Membro ativo', () => {
  const base = {
    personId: 'pessoa-1',
    person: { vinculo: 'Membro', ativo: true, email: 'membro@example.test' },
    role: 'atendimento',
    index: null,
    authorization: null,
    activeEmailMatchIds: ['pessoa-1'],
  };
  assert.doesNotThrow(() => validateAccessAuthorizationCreation(base));
  assert.throws(() => validateAccessAuthorizationCreation({ ...base, activeEmailMatchIds: ['pessoa-1', 'pessoa-2'] }), /EMAIL_MEMBRO_AMBIGUO/);
  assert.throws(() => validateAccessAuthorizationCreation({ ...base, activeEmailMatchIds: ['pessoa-2'] }), /EMAIL_MEMBRO_AMBIGUO/);
});

test('bloqueia autorização duplicada, já utilizada ou com Pessoa ocupada', () => {
  const base = { personId: 'pessoa-1', person: { vinculo: 'membro', email: 'membro@example.test' }, role: 'gestor', activeEmailMatchIds: ['pessoa-1'] };
  assert.throws(() => validateAccessAuthorizationCreation({ ...base, index: { uid: 'usuario-1' } }), /PESSOA_JA_POSSUI_ACESSO/);
  assert.throws(() => validateAccessAuthorizationCreation({ ...base, authorization: { status: 'pendente' } }), /AUTORIZACAO_PENDENTE_JA_EXISTE/);
  assert.throws(() => validateAccessAuthorizationCreation({ ...base, authorization: { status: 'utilizado' } }), /INDICE_AUTORIZACAO_INVALIDO/);
});
