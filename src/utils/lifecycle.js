export const LIFECYCLE_AUDIT_TYPES = Object.freeze({
  MEMBER_DEACTIVATED: 'MEMBRO_INATIVADO',
  MEMBER_REACTIVATED: 'MEMBRO_REATIVADO',
  ACCESS_REVOKED: 'USUARIO_ACESSO_REVOGADO',
  ACCESS_REACTIVATED: 'USUARIO_ACESSO_REATIVADO',
});

export const normalizeLifecycleReason = value => String(value || '').trim();

export const requireLifecycleReason = value => {
  const reason = normalizeLifecycleReason(value);
  if (!reason) throw new Error('MOTIVO_OBRIGATORIO');
  if (reason.length > 500) throw new Error('MOTIVO_MUITO_LONGO');
  return reason;
};
