export const getSaoPauloWeekday = timestamp => {
  const date = timestamp?.toDate?.() || timestamp;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('DATA_AGENDA_INVALIDA');
  const names = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
  const name = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' }).format(date).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace('-feira', '');
  return names[name];
};

export const getScheduledWorkerIds = ({ agendaDate, groups }) => {
  const weekday = getSaoPauloWeekday(agendaDate);
  const scheduled = (groups || []).filter(group => group.ativo !== false && (group.diasSemana || []).includes(weekday));
  if (!scheduled.length) throw new Error('TURMA_NAO_CONFIGURADA');
  return {
    groups: scheduled,
    mediuns: new Set(scheduled.flatMap(group => group.mediunsIds || [])),
    cambones: new Set(scheduled.flatMap(group => group.cambonesIds || [])),
  };
};
