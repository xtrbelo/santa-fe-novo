const getDate = value => value?.toDate?.() || (value instanceof Date ? value : new Date(value));

const saoPauloParts = value => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value).filter(item => item.type !== 'literal').map(item => [item.type, Number(item.value)]),
);

export const startOfSaoPauloDay = value => {
  const parts = saoPauloParts(value);
  return new Date(`${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T00:00:00-03:00`);
};

const isMember = person => String(person?.vinculo || person?.tipoPessoa || '').trim().toLowerCase() === 'membro';

export const selectMemberBirthdays = (people, { month, now = new Date() } = {}) => {
  const today = saoPauloParts(now);
  const selectedMonth = Number(month || today.month);
  if (!Number.isInteger(selectedMonth) || selectedMonth < 1 || selectedMonth > 12) throw new Error('MES_INVALIDO');

  return (people || [])
    .filter(person => person?.ativo !== false && isMember(person) && person?.ocultarAniversario !== true)
    .map(person => {
      const match = String(person?.dataNascimento || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
      if (!match) return null;
      const birthdayMonth = Number(match[1]);
      const day = Number(match[2]);
      if (birthdayMonth !== selectedMonth) return null;
      return {
        id: String(person.id || ''),
        nome: String(person.nome || '').trim(),
        dia: day,
        mes: birthdayMonth,
        hoje: birthdayMonth === today.month && day === today.day,
      };
    })
    .filter(item => item?.id && item.nome)
    .sort((a, b) => a.dia - b.dia || a.nome.localeCompare(b.nome, 'pt-BR'));
};

export const selectMemberCalendar = (agendas, { now = new Date(), limit = 20 } = {}) => {
  const start = startOfSaoPauloDay(now);

  return (agendas || [])
    .map(agenda => ({ ...agenda, scheduledDate: getDate(agenda?.data) }))
    .filter(agenda => Number.isFinite(agenda.scheduledDate?.getTime?.())
      && agenda.scheduledDate >= start
      && agenda.ativo !== false
      && !['Cancelada', 'Concluída'].includes(agenda.status)
      && Array.isArray(agenda.publicosPermitidos)
      && agenda.publicosPermitidos.includes('membro'))
    .sort((a, b) => a.scheduledDate - b.scheduledDate)
    .slice(0, limit)
    .map(agenda => ({
      id: String(agenda.id || ''),
      titulo: String(agenda.tipoTrabalhoNome || agenda.tipo || 'Atividade da Casa').trim(),
      data: agenda.scheduledDate.toISOString(),
      horario: String(agenda.horario || '').trim() || null,
      servicos: Array.isArray(agenda.servicosNomes)
        ? agenda.servicosNomes.map(String)
        : Object.values(agenda.servicosNomes || {}).map(String),
    }));
};
