export const PERSON_HISTORY_FILTERS = Object.freeze([
  ['todos', 'Tudo'], ['cadastro', 'Cadastro'], ['situacao', 'Situação'], ['acesso', 'Acesso'], ['comunicacao', 'E-mails'], ['atendimento', 'Atendimentos'],
]);

const labels = Object.freeze({
  PESSOA_CRIADA: 'Cadastro criado', PESSOA_ATUALIZADA: 'Cadastro atualizado', MEU_CADASTRO_ATUALIZADO: 'Cadastro atualizado pelo membro',
  MEMBRO_INATIVADO: 'Membro inativado', MEMBRO_REATIVADO: 'Membro reativado', USUARIO_AUTORIZADO: 'Acesso autorizado',
  USUARIO_VINCULADO: 'Usuário vinculado', USUARIO_VINCULO_REPARADO: 'Vínculo de acesso reparado', USUARIO_ROLE_ALTERADO: 'Perfil de acesso alterado',
  USUARIO_ACESSO_PREAUTORIZADO: 'Acesso pré-autorizado', USUARIO_ACESSO_ATIVADO: 'Acesso ativado', USUARIO_ACESSO_REVOGADO: 'Acesso revogado',
  USUARIO_ACESSO_REATIVADO: 'Acesso reativado', USUARIO_ACESSO_AUTORIZACAO_CANCELADA: 'Autorização de acesso cancelada', AUTOCADASTRO_MEMBRO_APROVADO: 'Autocadastro aprovado',
});

export const getPersonHistoryCategory = type => {
  if (String(type).startsWith('PESSOA_') || type === 'MEU_CADASTRO_ATUALIZADO' || type === 'AUTOCADASTRO_MEMBRO_APROVADO') return 'cadastro';
  if (String(type).startsWith('MEMBRO_')) return 'situacao';
  if (String(type).startsWith('USUARIO_')) return 'acesso';
  return 'cadastro';
};

export const describePersonAudit = event => ({
  category: getPersonHistoryCategory(event.tipo),
  title: labels[event.tipo] || 'Alteração administrativa',
  details: event.camposAlterados?.length ? `Campos: ${event.camposAlterados.join(', ')}` : event.valorAnterior !== undefined || event.valorNovo !== undefined ? `${event.valorAnterior || 'Não informado'} → ${event.valorNovo || 'Não informado'}` : null,
});
