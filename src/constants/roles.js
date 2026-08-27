export const ROLES = Object.freeze({
  ADMIN: 'admin',
  GESTOR: 'gestor',
  ATENDIMENTO: 'atendimento',
  PENDENTE: 'pendente'
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]: 'Administrador',
  [ROLES.GESTOR]: 'Gestor',
  [ROLES.ATENDIMENTO]: 'Atendimento',
  [ROLES.PENDENTE]: 'Pendente'
});

export const VALID_ROLES = Object.freeze(Object.values(ROLES));

export const ROLE_TABS = Object.freeze({
  [ROLES.ADMIN]: ['home', 'agendas', 'fluxo', 'pessoas', 'usuarios', 'config'],
  [ROLES.GESTOR]: ['home', 'agendas', 'fluxo', 'pessoas'],
  [ROLES.ATENDIMENTO]: ['home', 'fluxo', 'pessoas'],
  [ROLES.PENDENTE]: []
});
