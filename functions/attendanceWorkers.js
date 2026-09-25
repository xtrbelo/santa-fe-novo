const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export const normalizeWorkerIds = values => [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];

export const validateDayCanClose = (appointments, { attendanceOnly = false } = {}) => {
  if (!appointments?.length) throw new Error('ATENDIMENTOS_AUSENTES');
  const pendingStatuses = attendanceOnly ? ['Agendado'] : ['Agendado', 'Presente'];
  if (appointments.some(item => pendingStatuses.includes(item?.status))) throw new Error('ATENDIMENTOS_PENDENTES');
  return true;
};

export const getWorkerRoleIds = configurations => {
  const roles = { medium: new Set(['medium']), cambone: new Set(['cambone']) };
  (configurations || []).filter(item => item.ativo !== false).forEach(item => {
    const id = String(item.codigo || item.slug || item.id || '').trim();
    const name = normalize(item.nome || id);
    if (id && name === 'medium') roles.medium.add(id);
    if (id && name === 'cambone') roles.cambone.add(id);
  });
  return roles;
};

export const validateAttendanceWorkers = ({ mediunsIds, cambonesIds, peopleById, configurations }) => {
  const mediuns = normalizeWorkerIds(mediunsIds);
  const cambones = normalizeWorkerIds(cambonesIds);
  if (!mediuns.length && !cambones.length) throw new Error('TRABALHADOR_OBRIGATORIO');
  if (mediuns.length > 20 || cambones.length > 20) throw new Error('LIMITE_TRABALHADORES');
  if (mediuns.some(id => cambones.includes(id))) throw new Error('FUNCAO_TRABALHADOR_AMBIGUA');
  const roles = getWorkerRoleIds(configurations);
  const build = (ids, role) => ids.map(id => {
    const person = peopleById[id];
    const functions = Array.isArray(person?.funcoesCasa) ? person.funcoesCasa : [];
    const legacy = normalize(person?.tipoPessoa);
    const link = normalize(person?.vinculo);
    if (!person || person.ativo === false || (link !== 'membro' && !['membro', 'medium', 'cambone'].some(value => legacy.includes(value)))) throw new Error('TRABALHADOR_INVALIDO');
    if (![...roles[role]].some(functionId => functions.includes(functionId)) && !legacy.includes(role)) throw new Error('FUNCAO_TRABALHADOR_INVALIDA');
    return { pessoaBaseId: id, nome: String(person.nome || 'Membro sem nome').trim(), funcao: role };
  });
  return [...build(mediuns, 'medium'), ...build(cambones, 'cambone')];
};
