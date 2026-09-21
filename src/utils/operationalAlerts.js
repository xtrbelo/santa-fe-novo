const toMillis = value => value?.toMillis?.() || value?.toDate?.().getTime?.() || Number(value || 0);

export const isRegistrationOverdue = (request, now = Date.now(), thresholdHours = 48) => {
  if (request?.statusCadastro !== 'aguardando_validacao') return false;
  const createdAt = toMillis(request.criadoEm || request.enviadoEm);
  return createdAt > 0 && now - createdAt >= thresholdHours * 60 * 60 * 1000;
};

export const buildOperationalAlerts = ({ overdueRegistrations = 0, communicationFailures = 0, pendingUsers = 0 }) => [
  communicationFailures > 0 && { id: 'communication-failures', priority: 3, tone: 'rose', title: 'Falhas de comunicação', description: `${communicationFailures} mensagem(ns) precisam de verificação`, action: 'communications' },
  overdueRegistrations > 0 && { id: 'overdue-registrations', priority: 2, tone: 'amber', title: 'Solicitações aguardando há mais de 48 horas', description: `${overdueRegistrations} cadastro(s) aguardam análise`, action: 'registrations' },
  pendingUsers > 0 && { id: 'pending-users', priority: 1, tone: 'indigo', title: 'Usuários aguardando liberação', description: `${pendingUsers} acesso(s) aguardam decisão`, action: 'users' },
].filter(Boolean).sort((a, b) => b.priority - a.priority);
