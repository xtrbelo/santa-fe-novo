import { ROLES } from './roles.js';

export const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: 'dashboard_view',
  AGENDA_VIEW: 'agenda_view',
  AGENDA_MANAGE: 'agenda_manage',
  ATTENDANCE_VIEW: 'attendance_view',
  ATTENDANCE_MANAGE: 'attendance_manage',
  CONSULENTES_VIEW: 'consulentes_view',
  CONSULENTES_MANAGE: 'consulentes_manage',
  PEOPLE_VIEW: 'people_view',
  PEOPLE_MANAGE: 'people_manage',
  MEMBER_INVITES_MANAGE: 'member_invites_manage',
  MEMBER_REGISTRATIONS_REVIEW: 'member_registrations_review',
  USERS_VIEW: 'users_view',
  USERS_MANAGE: 'users_manage',
  ACCESS_AUTHORIZATION_MANAGE: 'access_authorization_manage',
  LIFECYCLE_MANAGE: 'lifecycle_manage',
  CONFIG_MANAGE: 'config_manage',
  AUDIT_VIEW: 'audit_view',
  MY_REGISTRATION_VIEW: 'my_registration_view',
  AGENDA_DELETE: 'agenda_delete',
  ATTENDANCE_RELOCATE: 'attendance_relocate',
  ATTENDANCE_STATUS_CORRECT: 'attendance_status_correct',
});

export const MODULES = Object.freeze({
  DASHBOARD: 'home',
  AGENDAS: 'agendas',
  PROGRAMACAO: 'programacao',
  ATTENDANCE: 'fluxo',
  PEOPLE: 'pessoas',
  MEMBER_INVITES: 'convites',
  MEMBER_REGISTRATIONS: 'autocadastros',
  USERS: 'usuarios',
  CONFIG: 'config',
  MY_REGISTRATION: 'meu-cadastro',
});

export const MODULE_PERMISSIONS = Object.freeze({
  [MODULES.DASHBOARD]: PERMISSIONS.DASHBOARD_VIEW,
  [MODULES.AGENDAS]: PERMISSIONS.AGENDA_VIEW,
  [MODULES.PROGRAMACAO]: PERMISSIONS.AGENDA_MANAGE,
  [MODULES.ATTENDANCE]: PERMISSIONS.ATTENDANCE_VIEW,
  [MODULES.PEOPLE]: PERMISSIONS.PEOPLE_VIEW,
  [MODULES.MEMBER_INVITES]: PERMISSIONS.MEMBER_INVITES_MANAGE,
  [MODULES.MEMBER_REGISTRATIONS]: PERMISSIONS.MEMBER_REGISTRATIONS_REVIEW,
  [MODULES.USERS]: PERMISSIONS.USERS_VIEW,
  [MODULES.CONFIG]: PERMISSIONS.CONFIG_MANAGE,
  [MODULES.MY_REGISTRATION]: PERMISSIONS.MY_REGISTRATION_VIEW,
});

export const PERMISSION_DENIED_MESSAGE = 'Você não possui permissão para acessar esta funcionalidade.';

const operational = [
  PERMISSIONS.DASHBOARD_VIEW,
  PERMISSIONS.AGENDA_VIEW,
  PERMISSIONS.ATTENDANCE_VIEW,
  PERMISSIONS.ATTENDANCE_MANAGE,
  PERMISSIONS.CONSULENTES_VIEW,
  PERMISSIONS.CONSULENTES_MANAGE,
  PERMISSIONS.PEOPLE_VIEW,
  PERMISSIONS.MY_REGISTRATION_VIEW,
];

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: Object.freeze(Object.values(PERMISSIONS)),
  [ROLES.GESTOR]: Object.freeze([
    ...operational,
    PERMISSIONS.AGENDA_MANAGE,
    PERMISSIONS.PEOPLE_MANAGE,
    PERMISSIONS.MEMBER_INVITES_MANAGE,
    PERMISSIONS.MEMBER_REGISTRATIONS_REVIEW,
    PERMISSIONS.ATTENDANCE_RELOCATE,
  ]),
  [ROLES.ATENDIMENTO]: Object.freeze(operational),
  [ROLES.PENDENTE]: Object.freeze([]),
});

export const hasEffectiveAccess = profile => Boolean(
  profile
  && profile.ativo !== false
  && (!profile.pessoaBaseId || profile.pessoaAtiva !== false)
);

export const hasPermission = (profile, permission) => Boolean(
  hasEffectiveAccess(profile)
  && ROLE_PERMISSIONS[profile.role]?.includes(permission)
);

export const canAccessModule = (profile, moduleId) => {
  const permission = MODULE_PERMISSIONS[moduleId];
  return Boolean(permission && hasPermission(profile, permission));
};

export const getAllowedModules = profile => Object.keys(MODULE_PERMISSIONS)
  .filter(moduleId => canAccessModule(profile, moduleId));

export const getModuleFromPathname = pathname => {
  const segment = String(pathname || '').split('/').filter(Boolean)[0];
  return segment || MODULES.DASHBOARD;
};

export const getModulePath = moduleId => moduleId === MODULES.DASHBOARD ? '/' : `/${moduleId}`;
