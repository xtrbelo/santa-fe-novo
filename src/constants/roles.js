export const ROLES = Object.freeze({
  ADMIN: 'admin',
  GESTOR: 'gestor',
  ATENDIMENTO: 'atendimento',
  PENDENTE: 'pendente'
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: 'Administrador',
  [ROLES.GESTOR]: 'Gestor / Dirigente',
  [ROLES.ATENDIMENTO]: 'Atendimento / Recepção',
  [ROLES.PENDENTE]: 'Pendente'
});

export const VALID_ROLES = Object.freeze(Object.values(ROLES));

export const ROLE_TABS = Object.freeze({
  [ROLES.ADMIN]: ['home', 'agendas', 'fluxo', 'pessoas', 'convites', 'autocadastros', 'usuarios', 'config'],
  [ROLES.GESTOR]: ['home', 'agendas', 'fluxo', 'pessoas', 'convites', 'autocadastros'],
  [ROLES.ATENDIMENTO]: ['home', 'agendas', 'fluxo', 'pessoas'],
  [ROLES.PENDENTE]: []
});
