const normalize = value => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const getPessoaVinculo = pessoa => {
  if (['consulente', 'membro'].includes(pessoa?.vinculo)) return pessoa.vinculo;
  const legacy = normalize(pessoa?.tipoPessoa);
  return legacy.includes('medium') || legacy.includes('cambone') || legacy.includes('membro') ? 'membro' : 'consulente';
};

export const getPessoaFuncoesCasa = pessoa => {
  if (Array.isArray(pessoa?.funcoesCasa)) return pessoa.funcoesCasa;
  const legacy = normalize(pessoa?.tipoPessoa);
  return ['medium', 'cambone'].filter(role => legacy.includes(role));
};

export const getPublicosPermitidosTrabalho = trabalho => {
  if (Array.isArray(trabalho?.publicosPermitidos)) return trabalho.publicosPermitidos;
  if (!Array.isArray(trabalho?.tiposPessoaPermitidos)) return [];
  return [...new Set(trabalho.tiposPessoaPermitidos.map(tipo => getPessoaVinculo({ tipoPessoa: tipo })))];
};

export const getAgendaPublicosPermitidos = agenda => getPublicosPermitidosTrabalho(agenda);
export const servicoControlaVagas = servico => servico?.controlaVagas ?? servico?.requerVagas ?? false;
export const servicoPertenceAoTrabalho = (servico, tipoTrabalhoId) => !Array.isArray(servico?.tipoTrabalhoIds) || servico.tipoTrabalhoIds.length === 0 || servico.tipoTrabalhoIds.includes(tipoTrabalhoId);
export const agendaAceitaServico = (agenda, serviceId) => !Array.isArray(agenda?.servicosIds) || agenda.servicosIds.includes(serviceId);
export const servicoAtivoNaAgenda = (agenda, serviceId) => agenda?.servicosStatus?.[serviceId] !== 'Cancelado';

export const getServicosAtivosAtendimento = atendimento => {
  const realocados = atendimento?.servicosRealocados || {};
  return (atendimento?.servicosIds || []).filter(id => !Object.hasOwn(realocados, id));
};
