const WEEKDAY_KEYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

export const WEEKDAYS = [
  { id: 1, label: 'Segunda' }, { id: 2, label: 'Terça' }, { id: 3, label: 'Quarta' },
  { id: 4, label: 'Quinta' }, { id: 5, label: 'Sexta' }, { id: 6, label: 'Sábado' }, { id: 0, label: 'Domingo' },
];

export const getAgendaWeekday = value => {
  const date = value?.toDate?.() || value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const name = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' }).format(date).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return WEEKDAY_KEYS.indexOf(name.replace('-feira', ''));
};

export const getScheduledWorkerGroups = ({ agendaDate, groups, workers }) => {
  const weekday = getAgendaWeekday(agendaDate);
  const scheduledGroups = (groups || []).filter(group => group.ativo !== false && (group.diasSemana || []).includes(weekday));
  const ids = role => new Set(scheduledGroups.flatMap(group => group[role === 'medium' ? 'mediunsIds' : 'cambonesIds'] || []));
  const mediumIds = ids('medium'); const camboneIds = ids('cambone');
  return {
    weekday,
    groups: scheduledGroups,
    mediuns: (workers?.mediuns || []).filter(item => mediumIds.has(item.id)),
    cambones: (workers?.cambones || []).filter(item => camboneIds.has(item.id)),
  };
};
