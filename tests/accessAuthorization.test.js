import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS_AUTHORIZATION_STATUS, buildAccessAuthorization, buildAuthorizedUser, canTransitionAccessAuthorization, validateAccessAuthorization } from '../src/utils/accessAuthorization.js';

const member = overrides => ({ nome: 'Membro', email: ' MEMBRO@EXAMPLE.TEST ', vinculo: 'membro', ativo: true, ...overrides });

test('aceita somente membro ativo com e-mail e role operacional', () => {
  assert.equal(validateAccessAuthorization({ pessoa: member(), role: 'atendimento' }), null);
  assert.equal(validateAccessAuthorization({ pessoa: member({ email: null }), role: 'atendimento' }), 'MEMBRO_SEM_EMAIL_ACESSO');
  assert.equal(validateAccessAuthorization({ pessoa: member({ vinculo: 'consulente' }), role: 'atendimento' }), 'PESSOA_NAO_E_MEMBRO_ATIVO');
  assert.equal(validateAccessAuthorization({ pessoa: member({ ativo: false }), role: 'atendimento' }), 'PESSOA_NAO_E_MEMBRO_ATIVO');
  assert.equal(validateAccessAuthorization({ pessoa: member(), role: 'pendente' }), 'AUTORIZACAO_INVALIDA');
});

test('constrói autorização normalizada sem credenciais ou CPF', () => {
  const authorization = buildAccessAuthorization({ pessoaId: 'p1', pessoa: member(), role: 'gestor', adminUid: 'admin', auditId: 'audit-1', now: 123 });
  assert.deepEqual(authorization, { pessoaBaseId: 'p1', email: 'membro@example.test', role: 'gestor', status: 'pendente', criadoEm: 123, criadoPor: 'admin', atualizadoEm: 123, atualizadoPor: 'admin', auditoriaPreautorizacaoId: 'audit-1' });
  assert.equal('cpf' in authorization || 'senha' in authorization || 'token' in authorization, false);
});

test('constrói usuário com identidade canônica da Pessoa e autoria sem falsificação', () => {
  const authorization = { pessoaBaseId: 'p1', email: 'membro@example.test', role: 'admin', criadoPor: 'admin-original' };
  const user = buildAuthorizedUser({ uid: 'auth-uid', pessoa: member({ nome: 'Nome Canônico' }), authorization, now: 456 });
  assert.equal(user.nome, 'Nome Canônico'); assert.equal(user.criadoPor, 'auth-uid'); assert.equal(user.autorizadoPor, 'admin-original');
});

test('permite somente transições institucionais previstas', () => {
  assert.equal(canTransitionAccessAuthorization(ACCESS_AUTHORIZATION_STATUS.PENDING, ACCESS_AUTHORIZATION_STATUS.USED), true);
  assert.equal(canTransitionAccessAuthorization(ACCESS_AUTHORIZATION_STATUS.PENDING, ACCESS_AUTHORIZATION_STATUS.CANCELLED), true);
  assert.equal(canTransitionAccessAuthorization(ACCESS_AUTHORIZATION_STATUS.CANCELLED, ACCESS_AUTHORIZATION_STATUS.PENDING), true);
  assert.equal(canTransitionAccessAuthorization(ACCESS_AUTHORIZATION_STATUS.USED, ACCESS_AUTHORIZATION_STATUS.PENDING), false);
  assert.equal(canTransitionAccessAuthorization(ACCESS_AUTHORIZATION_STATUS.CANCELLED, ACCESS_AUTHORIZATION_STATUS.USED), false);
});
