import { getPessoaVinculo } from './domain.js';
import { isValidEmail, normalizeEmail } from './pessoaForm.js';

export const ACCESS_AUTHORIZATION_ROLES = Object.freeze(['admin', 'gestor', 'atendimento']);
export const ACCESS_AUTHORIZATION_STATUS = Object.freeze({ PENDING: 'pendente', USED: 'utilizado', CANCELLED: 'cancelado' });

export const isAccessAuthorizationRole = role => ACCESS_AUTHORIZATION_ROLES.includes(role);
export const isEligibleAccessMember = pessoa => !!pessoa && pessoa.ativo !== false && getPessoaVinculo(pessoa) === 'membro' && isValidEmail(normalizeEmail(pessoa.email));

export const validateAccessAuthorization = ({ pessoa, role }) => {
  if (!pessoa || pessoa.ativo === false || getPessoaVinculo(pessoa) !== 'membro') return 'PESSOA_NAO_E_MEMBRO_ATIVO';
  if (!isValidEmail(normalizeEmail(pessoa.email))) return 'MEMBRO_SEM_EMAIL_ACESSO';
  if (!isAccessAuthorizationRole(role)) return 'AUTORIZACAO_INVALIDA';
  return null;
};

export const buildAccessAuthorization = ({ pessoaId, pessoa, role, adminUid, auditId, now }) => ({
  pessoaBaseId: pessoaId,
  email: normalizeEmail(pessoa.email),
  role,
  status: ACCESS_AUTHORIZATION_STATUS.PENDING,
  criadoEm: now,
  criadoPor: adminUid,
  atualizadoEm: now,
  atualizadoPor: adminUid,
  auditoriaPreautorizacaoId: auditId,
});

export const buildAuthorizedUser = ({ uid, pessoa, authorization, now }) => ({
  uid,
  pessoaBaseId: authorization.pessoaBaseId,
  nome: pessoa.nome,
  email: authorization.email,
  role: authorization.role,
  ativo: true,
  criadoEm: now,
  criadoPor: uid,
  autorizadoPor: authorization.criadoPor,
  atualizadoEm: now,
  atualizadoPor: uid,
});

export const canTransitionAccessAuthorization = (from, to) => (
  (from === ACCESS_AUTHORIZATION_STATUS.PENDING && [ACCESS_AUTHORIZATION_STATUS.USED, ACCESS_AUTHORIZATION_STATUS.CANCELLED].includes(to))
  || (from === ACCESS_AUTHORIZATION_STATUS.CANCELLED && to === ACCESS_AUTHORIZATION_STATUS.PENDING)
);
