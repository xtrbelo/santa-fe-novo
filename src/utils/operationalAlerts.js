const toMillis = value => value?.toMillis?.() || value?.toDate?.().getTime?.() || Number(value || 0);

export const isRegistrationOverdue = (request, now = Date.now(), thresholdHours = 48) => {
  if (request?.statusCadastro !== 'aguardando_validacao') return false;
  const createdAt = toMillis(request.criadoEm || request.enviadoEm);
  return createdAt > 0 && now - createdAt >= thresholdHours * 60 * 60 * 1000;
};

const competenceOf = value => String(value?.competencia || value?.periodoInicio || '').slice(0, 7);

export const hasIncompleteBookRecord = record => {
  if (!Array.isArray(record?.atendimentos)) return true;
  return record.atendimentos.some(item => !item?.nome
    || item.nome === 'Nome não informado'
    || !item.servicos?.length
    || (item.status === 'Concluído' && (!item.horaChegada || !item.horaConclusao)));
};

export const summarizeBookPendingItems = (volumes = [], records = []) => {
  const activeVolumes = volumes.filter(volume => Number(volume.quantidadeRegistros || 0) > 0 || records.some(record => record.volumeId === volume.id));
  const unsigned = activeVolumes.filter(volume => volume.status === 'encerrado').sort((a, b) => competenceOf(a).localeCompare(competenceOf(b)));
  const activeVolumeIds = new Set(activeVolumes.filter(volume => volume.status !== 'arquivado').map(volume => volume.id));
  const incomplete = records.filter(record => activeVolumeIds.has(record.volumeId) && hasIncompleteBookRecord(record));
  return { unsignedCount: unsigned.length, oldestUnsignedCompetence: competenceOf(unsigned[0]), incompleteCount: incomplete.length, automaticClosureFailures: activeVolumes.filter(volume => volume.status === 'aberto' && volume.fechamentoAutomaticoErro).length };
};

export const buildOperationalAlerts = ({ overdueRegistrations = 0, communicationFailures = 0, pendingUsers = 0, bookUnsignedVolumes = 0, bookOldestUnsignedCompetence = '', bookIncompleteRecords = 0, bookAutomaticClosureFailures = 0 }) => [
  communicationFailures > 0 && { id: 'communication-failures', priority: 3, tone: 'rose', title: 'Falhas de comunicação', description: `${communicationFailures} mensagem(ns) precisam de verificação`, action: 'communications' },
  bookAutomaticClosureFailures > 0 && { id: 'book-automatic-closure-failures', priority: 4, tone: 'rose', title: 'Falha no fechamento mensal', description: `${bookAutomaticClosureFailures} volume(s) precisam ser fechados manualmente`, action: 'book' },
  bookIncompleteRecords > 0 && { id: 'book-incomplete-records', priority: 3, tone: 'rose', title: 'Livro Mediúnico com registros incompletos', description: `${bookIncompleteRecords} fechamento(s) precisam de conferência`, action: 'book' },
  bookUnsignedVolumes > 0 && { id: 'book-unsigned-volumes', priority: 2.5, tone: 'amber', title: 'Volumes aguardando assinatura', description: `${bookUnsignedVolumes} volume(s) pendente(s)${bookOldestUnsignedCompetence ? ` · mais antigo: ${bookOldestUnsignedCompetence.split('-').reverse().join('/')}` : ''}`, action: 'book' },
  overdueRegistrations > 0 && { id: 'overdue-registrations', priority: 2, tone: 'amber', title: 'Solicitações aguardando há mais de 48 horas', description: `${overdueRegistrations} cadastro(s) aguardam análise`, action: 'registrations' },
  pendingUsers > 0 && { id: 'pending-users', priority: 1, tone: 'indigo', title: 'Usuários aguardando liberação', description: `${pendingUsers} acesso(s) aguardam decisão`, action: 'users' },
].filter(Boolean).sort((a, b) => b.priority - a.priority);
