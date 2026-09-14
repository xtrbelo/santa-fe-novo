const DAY_MS = 86400000;

export const getRegistrationRequestWaitingInfo = (request, now = Date.now()) => {
  if (request?.statusCadastro !== 'aguardando_validacao') return null;
  const sentAt = request.enviadoEm?.toMillis?.();
  if (!Number.isFinite(sentAt)) return { days: 0, overdue: false, label: 'Tempo de espera indisponível' };
  const days = Math.max(0, Math.floor((now - sentAt) / DAY_MS));
  return { days, overdue: days > 7, label: days < 1 ? 'Aguardando há menos de 1 dia' : `Aguardando há ${days} ${days === 1 ? 'dia' : 'dias'}` };
};

export const compareRegistrationRequestsByPriority = (a, b) => {
  const aPending = a?.statusCadastro === 'aguardando_validacao';
  const bPending = b?.statusCadastro === 'aguardando_validacao';
  const aTime = a?.enviadoEm?.toMillis?.() || 0;
  const bTime = b?.enviadoEm?.toMillis?.() || 0;
  if (aPending && bPending) return aTime - bTime;
  if (aPending !== bPending) return aPending ? -1 : 1;
  return bTime - aTime;
};
