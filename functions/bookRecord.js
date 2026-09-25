const activeServiceIds = appointment => (appointment?.servicosIds || []).filter(id => !Object.hasOwn(appointment?.servicosRealocados || {}, id));

const serviceName = (appointment, id) => {
  const names = appointment?.servicosNomes;
  if (Array.isArray(names)) return names[(appointment?.servicosIds || []).indexOf(id)] || id;
  return names?.[id] || id;
};

export const buildBookAttendances = appointments => appointments.map(item => {
  const appointment = typeof item.data === 'function' ? item.data() : item;
  return {
    agendamentoId: item.id || appointment.id || null,
    pessoaBaseId: appointment.pessoaBaseId || null,
    nome: String(appointment.nome || appointment.pessoaNome || 'Nome não informado').trim(),
    servicos: activeServiceIds(appointment).map(id => ({ id, nome: String(serviceName(appointment, id)).trim() })),
    status: String(appointment.status || 'Não informado'),
    horaChegada: appointment.horaChegada || null,
    horaConclusao: appointment.horaSaida || appointment.concluidoEm || null,
  };
});
