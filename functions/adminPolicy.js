export const requiresAdminCount = (target, next) =>
  target?.role === 'admin' && target?.ativo !== false
  && (next.role !== 'admin' || next.ativo === false);

export const isActiveAdmin = user => user?.role === 'admin' && user?.ativo !== false;

export const resolveProjectId = ({ appProjectId, googleCloudProject, gcloudProject }) =>
  appProjectId || googleCloudProject || gcloudProject || null;

export const requiresActiveMember = ({ action, target, active }) =>
  Boolean(target?.pessoaBaseId) && (action === 'role' || (action === 'active' && active === true));

export const assertAdminContinuity = ({ target, next, activeAdminCount }) => {
  if (requiresAdminCount(target, next) && activeAdminCount <= 1) throw new Error('ULTIMO_ADMINISTRADOR');
};

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const memberType = person => String(person?.vinculo || person?.tipoPessoa || '').trim().toLowerCase();

export const validateAccessAuthorizationCreation = ({ personId, person, role, index, authorization, activeEmailMatchIds = [] }) => {
  if (!personId || !person) throw new Error('PESSOA_NAO_E_MEMBRO_ATIVO');
  if (!['admin', 'gestor', 'atendimento'].includes(role)) throw new Error('AUTORIZACAO_INVALIDA');
  if (person.ativo === false || memberType(person) !== 'membro') throw new Error('PESSOA_NAO_E_MEMBRO_ATIVO');
  if (!normalizeEmail(person.email)) throw new Error('MEMBRO_SEM_EMAIL_ACESSO');
  if (activeEmailMatchIds.length !== 1 || activeEmailMatchIds[0] !== personId) throw new Error('EMAIL_MEMBRO_AMBIGUO');
  if (index) throw new Error('PESSOA_JA_POSSUI_ACESSO');
  if (authorization?.status === 'pendente') throw new Error('AUTORIZACAO_PENDENTE_JA_EXISTE');
  if (authorization?.status === 'utilizado') throw new Error('INDICE_AUTORIZACAO_INVALIDO');
};

export const validateUserPersonLinkChange = ({ targetUid, target, currentPersonExists, nextPersonId, nextPerson, nextIndex, activeEmailMatchIds = [nextPersonId] }) => {
  if (!targetUid || !target || !nextPersonId) throw new Error('OPERACAO_INVALIDA');
  if (!['admin', 'gestor', 'atendimento'].includes(target.role)) throw new Error('ROLE_INVALIDA');
  if (!nextPerson || nextPerson.ativo === false || memberType(nextPerson) !== 'membro') throw new Error('PESSOA_NAO_E_MEMBRO_ATIVO');
  if (!normalizeEmail(nextPerson.email)) throw new Error('MEMBRO_SEM_EMAIL_ACESSO');
  if (normalizeEmail(nextPerson.email) !== normalizeEmail(target.email)) throw new Error('EMAIL_MEMBRO_DIVERGENTE');
  if (activeEmailMatchIds.length !== 1 || activeEmailMatchIds[0] !== nextPersonId) throw new Error('EMAIL_MEMBRO_AMBIGUO');
  if (nextIndex && nextIndex.uid !== targetUid) throw new Error('PESSOA_JA_POSSUI_ACESSO');
  const previousPessoaBaseId = target.pessoaBaseId || null;
  if (previousPessoaBaseId === nextPersonId && currentPersonExists && nextIndex) return { updated: false, repaired: false, previousPessoaBaseId };
  if (previousPessoaBaseId === nextPersonId && currentPersonExists) return { updated: true, repaired: false, previousPessoaBaseId };
  if (previousPessoaBaseId && currentPersonExists) throw new Error('USUARIO_JA_VINCULADO');
  return { updated: true, repaired: Boolean(previousPessoaBaseId), previousPessoaBaseId };
};
