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
