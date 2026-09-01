import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canAccessModule,
  getAllowedModules,
  getModuleFromPathname,
  getModulePath,
  hasPermission,
  MODULES,
  PERMISSION_DENIED_MESSAGE,
  PERMISSIONS,
} from '../src/constants/permissions.js';
import { ROLE_LABELS, ROLES, VALID_ROLES } from '../src/constants/roles.js';

const profile = role => ({ role, ativo: true });

test('mantém somente os quatro roles internos e os labels consolidados', () => {
  assert.deepEqual([...VALID_ROLES].sort(), ['admin', 'atendimento', 'gestor', 'pendente']);
  assert.equal(ROLE_LABELS.gestor, 'Gestor / Dirigente');
  assert.equal(ROLE_LABELS.atendimento, 'Atendimento / Recepção');
});

test('Admin acessa todos os módulos e ações institucionais', () => {
  const admin = profile(ROLES.ADMIN);
  assert.deepEqual(getAllowedModules(admin), Object.values(MODULES));
  for (const permission of [PERMISSIONS.USERS_MANAGE, PERMISSIONS.ACCESS_AUTHORIZATION_MANAGE, PERMISSIONS.LIFECYCLE_MANAGE, PERMISSIONS.CONFIG_MANAGE, PERMISSIONS.AUDIT_VIEW]) {
    assert.equal(hasPermission(admin, permission), true);
  }
});

test('Gestor preserva módulos de negócio sem gestão institucional de acesso', () => {
  const gestor = profile(ROLES.GESTOR);
  for (const moduleId of [MODULES.DASHBOARD, MODULES.AGENDAS, MODULES.ATTENDANCE, MODULES.PEOPLE, MODULES.MEMBER_INVITES, MODULES.MEMBER_REGISTRATIONS, MODULES.MY_REGISTRATION]) {
    assert.equal(canAccessModule(gestor, moduleId), true);
  }
  for (const permission of [PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_MANAGE, PERMISSIONS.ACCESS_AUTHORIZATION_MANAGE, PERMISSIONS.LIFECYCLE_MANAGE, PERMISSIONS.CONFIG_MANAGE]) {
    assert.equal(hasPermission(gestor, permission), false);
  }
});

test('Atendimento acessa operação e Meu Cadastro, sem módulos administrativos', () => {
  const atendimento = profile(ROLES.ATENDIMENTO);
  for (const moduleId of [MODULES.DASHBOARD, MODULES.AGENDAS, MODULES.ATTENDANCE, MODULES.PEOPLE, MODULES.MY_REGISTRATION]) {
    assert.equal(canAccessModule(atendimento, moduleId), true);
  }
  for (const moduleId of [MODULES.USERS, MODULES.MEMBER_INVITES, MODULES.MEMBER_REGISTRATIONS, MODULES.CONFIG]) {
    assert.equal(canAccessModule(atendimento, moduleId), false);
  }
  assert.equal(hasPermission(atendimento, PERMISSIONS.CONSULENTES_MANAGE), true);
  assert.equal(hasPermission(atendimento, PERMISSIONS.PEOPLE_MANAGE), false);
});

test('acesso direto a módulo restrito usa a mesma matriz da navegação', () => {
  assert.equal(canAccessModule(profile(ROLES.GESTOR), MODULES.USERS), false);
  assert.equal(canAccessModule(profile(ROLES.ATENDIMENTO), MODULES.CONFIG), false);
  assert.equal(PERMISSION_DENIED_MESSAGE, 'Você não possui permissão para acessar esta funcionalidade.');
  const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /!canAccessModule\(profile, tab\)/);
  assert.match(appSource, /<PermissionDenied/);
  assert.equal(getModuleFromPathname('/usuarios'), MODULES.USERS);
  assert.equal(getModulePath(MODULES.USERS), '/usuarios');
  assert.equal(getModuleFromPathname('/'), MODULES.DASHBOARD);
  assert.match(appSource, /popstate/);
});

test('menus desktop e mobile consultam a matriz central', () => {
  for (const file of ['../src/components/layout/Sidebar.jsx', '../src/components/layout/MobileNav.jsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /canAccessModule\(profile, item\.id\)/);
    assert.doesNotMatch(source, /ROLE_TABS|allowedTabs\.includes/);
  }
});

test('usuário revogado ou vinculado a Membro inativo não possui permissões', () => {
  assert.equal(hasPermission({ role: ROLES.ADMIN, ativo: false }, PERMISSIONS.USERS_MANAGE), false);
  assert.equal(hasPermission({ role: ROLES.ADMIN, ativo: true, pessoaBaseId: 'p1', pessoaAtiva: false }, PERMISSIONS.USERS_MANAGE), false);
});

test('usuário legado ativo permanece compatível e pendente continua sem acesso', () => {
  assert.equal(canAccessModule({ role: ROLES.GESTOR, ativo: true }, MODULES.AGENDAS), true);
  assert.equal(getAllowedModules({ role: ROLES.PENDENTE, ativo: true }).length, 0);
});

test('ações administrativas consultam permissões, sem checks de role na UI principal', () => {
  const usersSource = readFileSync(new URL('../src/modules/Usuarios/UsuariosModule.jsx', import.meta.url), 'utf8');
  const peopleSource = readFileSync(new URL('../src/modules/Pessoas/PessoasModule.jsx', import.meta.url), 'utf8');
  assert.match(usersSource, /PERMISSIONS\.USERS_MANAGE/);
  assert.match(peopleSource, /PERMISSIONS\.LIFECYCLE_MANAGE/);
  assert.doesNotMatch(usersSource, /profile\?\.role !== ROLES\.ADMIN/);
});
