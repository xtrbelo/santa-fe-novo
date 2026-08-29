import { ROLES } from './roles.js';

export const PERMISSIONS = Object.freeze({
  VIEW_AGENDAS: 'view_agendas', MARK_APPOINTMENT: 'mark_appointment', MANAGE_AGENDAS: 'manage_agendas',
  CANCEL_AGENDA: 'cancel_agenda', DELETE_AGENDA: 'delete_agenda', RELOCATE: 'relocate', CORRECT_STATUS: 'correct_status',
  VIEW_PEOPLE: 'view_people', CREATE_CONSULENTE: 'create_consulente', MANAGE_PEOPLE: 'manage_people',
  MANAGE_USERS: 'manage_users', MANAGE_CONFIG: 'manage_config', MAINTENANCE: 'maintenance', VIEW_AUDIT: 'view_audit'
});

const operational = [PERMISSIONS.VIEW_AGENDAS, PERMISSIONS.MARK_APPOINTMENT, PERMISSIONS.VIEW_PEOPLE, PERMISSIONS.CREATE_CONSULENTE];
export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.GESTOR]: [...operational, PERMISSIONS.MANAGE_AGENDAS, PERMISSIONS.CANCEL_AGENDA, PERMISSIONS.RELOCATE, PERMISSIONS.MANAGE_PEOPLE],
  [ROLES.ATENDIMENTO]: operational,
  [ROLES.PENDENTE]: []
});

export const hasPermission = (profile, permission) => Boolean(profile?.ativo !== false && ROLE_PERMISSIONS[profile?.role]?.includes(permission));
