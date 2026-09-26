const LABELS = Object.freeze({
  PESSOA_CRIADA: 'Pessoa cadastrada', PESSOA_ATUALIZADA: 'Cadastro de Pessoa atualizado', MEU_CADASTRO_ATUALIZADO: 'Cadastro atualizado pelo membro',
  MEMBRO_INATIVADO: 'Membro inativado', MEMBRO_REATIVADO: 'Membro reativado', AUTOCADASTRO_MEMBRO_APROVADO: 'Cadastro de Membro aprovado', AUTOCADASTRO_MEMBRO_REJEITADO: 'Cadastro de Membro rejeitado',
  USUARIO_AUTORIZADO: 'Usuário autorizado', USUARIO_VINCULADO: 'Usuário vinculado', USUARIO_VINCULO_REPARADO: 'Vínculo de usuário reparado', USUARIO_ROLE_ALTERADO: 'Perfil de acesso alterado', USUARIO_STATUS_ALTERADO: 'Situação do usuário alterada', USUARIO_ACESSO_PREAUTORIZADO: 'Acesso pré-autorizado', USUARIO_ACESSO_ATIVADO: 'Acesso ativado', USUARIO_ACESSO_REVOGADO: 'Acesso revogado', USUARIO_ACESSO_REATIVADO: 'Acesso reativado', USUARIO_ACESSO_AUTORIZACAO_CANCELADA: 'Autorização de acesso cancelada',
  AGENDAMENTO_CANCELADO: 'Agendamento cancelado', AGENDAMENTO_EDITADO: 'Agendamento editado', PRIORIDADE_ALTERADA: 'Prioridade alterada', ATENDIMENTO_SERVICOS_ALTERADOS: 'Serviços do atendimento alterados', STATUS_ATENDIMENTO_CORRIGIDO: 'Status do atendimento corrigido', ATENDIMENTO_REAGENDADO: 'Atendimento reagendado', SERVICO_REALOCADO: 'Serviço realocado',
  AGENDA_CONCLUIDA: 'Atendimento do dia fechado', AGENDA_EDITADA: 'Agenda atualizada', AGENDA_CANCELADA: 'Agenda cancelada', AGENDA_EXCLUIDA: 'Agenda excluída', SERVICO_AGENDA_CANCELADO: 'Serviço cancelado na agenda', VAGAS_RECONCILIADAS: 'Vagas reconciliadas', CPF_INDEX_RECONSTRUIDO: 'Índice de CPF reparado',
  DADOS_PESSOAIS_EXPORTADOS: 'Dados pessoais exportados',
});

const FIELD_LABELS = Object.freeze({
  nome: 'Nome', cpf: 'CPF', email: 'E-mail', contato: 'Contato', dataNascimento: 'Data de nascimento', sexo: 'Sexo', estadoCivil: 'Estado civil', endereco: 'Endereço', vinculo: 'Vínculo', tipoPessoa: 'Tipo de pessoa', funcoesCasa: 'Funções na Casa', dadosCasa: 'Dados da Casa', ativo: 'Situação do cadastro', role: 'Perfil de acesso', status: 'Situação', servicosIds: 'Serviços', prioridade: 'Prioridade', observacao: 'Observação', dataIngresso: 'Data de entrada', batizadoCaesf: 'Batizado na CAESF', dataBatismoCaesf: 'Data de batismo',
});

export const getAuditOrigin = type => {
  const value = String(type || '');
  if (value === 'AGENDA_CONCLUIDA') return 'Fluxo do Dia';
  if (value === 'MEU_CADASTRO_ATUALIZADO') return 'Meu Cadastro';
  if (value.startsWith('AUTOCADASTRO_')) return 'Solicitações de cadastro';
  if (value.startsWith('USUARIO_')) return 'Usuários e acessos';
  if (value.startsWith('PESSOA_') || value.startsWith('MEMBRO_') || value === 'CPF_INDEX_RECONSTRUIDO') return 'Pessoas';
  if (value.startsWith('AGENDA_') || value === 'SERVICO_AGENDA_CANCELADO' || value === 'VAGAS_RECONCILIADAS') return 'Programação';
  if (['AGENDAMENTO_CANCELADO', 'AGENDAMENTO_EDITADO', 'ATENDIMENTO_REAGENDADO', 'SERVICO_REALOCADO'].includes(value)) return 'Agendamentos';
  if (['PRIORIDADE_ALTERADA', 'ATENDIMENTO_SERVICOS_ALTERADOS', 'STATUS_ATENDIMENTO_CORRIGIDO'].includes(value)) return 'Fluxo do Dia';
  return 'Sistema';
};

export const getClosureDetails = ({ event, agenda, appointments = [] }) => {
  if (event?.tipo !== 'AGENDA_CONCLUIDA') return null;
  const type = event.tipoFechamento || agenda?.tipoFechamento || (agenda?.trabalhadoresDia?.length ? 'atendimento' : 'lista_presenca');
  const workers = agenda?.trabalhadoresDia || [];
  const regular = role => workers.filter(item => item.funcao === role && !item.substituto).map(item => item.nome);
  const substitutes = workers.filter(item => item.substituto).map(item => `${item.nome} (${item.funcao === 'medium' ? 'Médium' : 'Cambone'})`);
  const eventTeam = (agenda?.equipeEventoDia || event.equipeEvento || []).map(item => `${item.nome} (${item.funcao})`);
  const bookResponsible = agenda?.dirigenteResponsavelDia || event.dirigenteResponsavel || null;
  const calculatedPresence = appointments.filter(item => !['Cancelado', 'Reagendado', 'Faltou'].includes(item.status)).length;
  return {
    type,
    typeLabel: type === 'atendimento' ? 'Atendimento da Casa' : type === 'evento_servicos' ? 'Evento com serviços' : 'Lista de presença — trabalho interno',
    workName: agenda?.tipoTrabalhoNome || agenda?.tipo || 'Trabalho não informado',
    groups: (agenda?.gruposTrabalhoDia || []).map(item => item.nome || item.id).filter(Boolean),
    mediuns: regular('medium'),
    cambones: regular('cambone'),
    substitutes,
    eventTeam,
    bookResponsible: bookResponsible ? `${bookResponsible.nome} (${bookResponsible.papel === 'titular' ? 'Dirigente titular' : 'Responsável substituta'})` : null,
    presenceCount: event.quantidadePresencas ?? agenda?.quantidadePresencasFechamento ?? calculatedPresence,
  };
};

export const getAuditFieldDetails = event => (event.camposAlterados || []).map(field => ({
  field,
  label: FIELD_LABELS[field] || String(field).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, letter => letter.toUpperCase()),
  before: event.valoresAnteriores?.[field],
  after: event.valoresNovos?.[field],
  hasValues: Object.hasOwn(event.valoresAnteriores || {}, field) || Object.hasOwn(event.valoresNovos || {}, field),
}));

export const getAuditReferences = event => [
  ['Pessoa', event.personId || event.pessoaBaseId || event.pessoaId],
  ['Usuário', event.alvoUid],
  ['Agenda', event.agendaId],
  ['Atendimento', event.agendamentoId || (event.agendaId ? event.alvoId : null)],
  ['Solicitação', event.autocadastroId || event.inviteId],
  ['Link', event.linkId],
].filter(([, value]) => value).map(([label, value]) => ({ label, value }));

export const getAuditCategory = type => {
  if (String(type).startsWith('USUARIO_')) return 'acesso';
  if (String(type).startsWith('AGENDA_') || type === 'VAGAS_RECONCILIADAS' || type === 'SERVICO_AGENDA_CANCELADO') return 'agenda';
  if (['AGENDAMENTO_CANCELADO', 'PRIORIDADE_ALTERADA', 'ATENDIMENTO_SERVICOS_ALTERADOS', 'STATUS_ATENDIMENTO_CORRIGIDO', 'ATENDIMENTO_REAGENDADO', 'SERVICO_REALOCADO'].includes(type)) return 'atendimento';
  if (String(type).startsWith('PESSOA_') || String(type).startsWith('MEMBRO_') || String(type).startsWith('AUTOCADASTRO_') || type === 'MEU_CADASTRO_ATUALIZADO' || type === 'CPF_INDEX_RECONSTRUIDO') return 'cadastro';
  return 'outros';
};

export const describeAuditEvent = event => ({
  category: getAuditCategory(event.tipo),
  title: LABELS[event.tipo] || String(event.tipo || 'Alteração no sistema').replaceAll('_', ' '),
  detail: event.tipo === 'DADOS_PESSOAIS_EXPORTADOS' ? `${event.quantidadeRegistros || 0} registro(s) · módulo ${event.modulo || event.alvoId || 'não informado'}` : event.motivo ? `Motivo: ${event.motivo}` : event.camposAlterados?.length ? `Campos: ${event.camposAlterados.join(', ')}` : event.statusAnterior || event.statusNovo ? `${event.statusAnterior || 'Não informado'} → ${event.statusNovo || 'Não informado'}` : event.servicosAnteriores || event.servicosNovos ? `Serviços: ${(event.servicosAnteriores || []).join(', ') || 'nenhum'} → ${(event.servicosNovos || []).join(', ') || 'nenhum'}` : null,
});

const auditValue = value => {
  if (value === undefined || value === null || value === '') return 'Não informado';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.join(', ') || 'Nenhum';
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join(', ') || 'Nenhum';
  return String(value);
};

export const getAuditChanges = event => {
  if (event.valorAnterior !== undefined || event.valorNovo !== undefined) return [{ label: event.changeLabel || 'Valor', before: auditValue(event.valorAnteriorLabel ?? event.valorAnterior), after: auditValue(event.valorNovoLabel ?? event.valorNovo) }];
  if (event.statusAnterior !== undefined || event.statusNovo !== undefined) return [{ label: 'Situação', before: auditValue(event.statusAnterior), after: auditValue(event.statusNovo) }];
  if (event.servicosAnteriores !== undefined || event.servicosNovos !== undefined) return [{ label: 'Serviços', before: auditValue(event.servicosAnterioresNomes ?? event.servicosAnteriores), after: auditValue(event.servicosNovosNomes ?? event.servicosNovos) }];
  if (event.vagasAntes !== undefined || event.vagasDepois !== undefined) return [{ label: 'Vagas', before: auditValue(event.vagasAntes), after: auditValue(event.vagasDepois) }];
  return [];
};

export const filterAuditEvents = (events, { category = 'todos', type = 'todos', period = '30', responsible = 'todos', startDate = '', endDate = '', search = '', now = Date.now() } = {}) => {
  const term = String(search).trim().toLowerCase();
  const cutoff = period === 'todos' ? 0 : now - Number(period) * 86400000;
  const customStart = period === 'personalizado' && startDate ? new Date(`${startDate}T00:00:00`).getTime() : 0;
  const customEnd = period === 'personalizado' && endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : 0;
  return events.filter(event => (category === 'todos' || event.category === category) && (type === 'todos' || event.tipo === type) && (responsible === 'todos' || event.responsibleId === responsible) && (period === 'personalizado' ? (!customStart || event.timestamp >= customStart) && (!customEnd || event.timestamp <= customEnd) : (!cutoff || (event.timestamp || 0) >= cutoff)) && (!term || event.searchText?.includes(term))).sort((a, b) => b.timestamp - a.timestamp);
};

const csvCell = value => {
  const safe = /^[=+\-@]/.test(String(value || '')) ? `'${value}` : String(value ?? '');
  return `"${safe.replaceAll('"', '""')}"`;
};

export const buildAuditCsv = events => {
  const header = ['Data', 'Categoria', 'Origem', 'Alteração', 'Registro', 'Responsável', 'Detalhes', 'Campos alterados', 'Registros relacionados', 'Antes', 'Depois'];
  const rows = events.map(event => {
    const change = getAuditChanges(event)[0];
    const fields = getAuditFieldDetails(event).map(item => item.label).join(', ');
    const references = getAuditReferences(event).map(item => `${item.label}: ${item.value}`).join(', ');
    return [event.dateText || '', event.categoryLabel || event.category || '', event.origin || getAuditOrigin(event.tipo), event.title || '', event.subject || '', event.responsible || '', event.detail || '', fields, references, change?.before || '', change?.after || ''];
  });
  return `\uFEFF${[header, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n')}`;
};

export const paginateAuditEvents = (events, page = 1, pageSize = 10) => {
  const size = [10, 20, 50, 100].includes(Number(pageSize)) ? Number(pageSize) : 10;
  const totalPages = Math.max(1, Math.ceil(events.length / size));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (currentPage - 1) * size;
  return { items: events.slice(start, start + size), currentPage, totalPages, start: events.length ? start + 1 : 0, end: Math.min(start + size, events.length), total: events.length };
};
