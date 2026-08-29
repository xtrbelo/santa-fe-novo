import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission, PERMISSIONS } from '../src/constants/permissions.js';
import { ROLE_LABELS, ROLE_TABS, ROLES, VALID_ROLES } from '../src/constants/roles.js';

test('mantém somente os quatro roles internos e os novos labels', () => {
  assert.deepEqual([...VALID_ROLES].sort(), ['admin', 'atendimento', 'gestor', 'pendente']);
  assert.equal(ROLE_LABELS.gestor, 'Gestor / Dirigente');
  assert.equal(ROLE_LABELS.atendimento, 'Atendimento / Recepção');
});

test('Atendimento acessa Agenda operacional sem permissão administrativa', () => {
  const profile = { role: ROLES.ATENDIMENTO, ativo: true };
  assert.ok(ROLE_TABS.atendimento.includes('agendas'));
  assert.equal(hasPermission(profile, PERMISSIONS.MARK_APPOINTMENT), true);
  assert.equal(hasPermission(profile, PERMISSIONS.MANAGE_AGENDAS), false);
  assert.equal(hasPermission(profile, PERMISSIONS.MANAGE_USERS), false);
});

test('Gestor gerencia operação sem usuários/configuração e Admin possui acesso total', () => {
  const gestor = { role: ROLES.GESTOR, ativo: true };
  assert.equal(hasPermission(gestor, PERMISSIONS.RELOCATE), true);
  assert.equal(hasPermission(gestor, PERMISSIONS.MANAGE_USERS), false);
  assert.equal(hasPermission({ role: ROLES.ADMIN, ativo: true }, PERMISSIONS.MANAGE_USERS), true);
  assert.equal(hasPermission({ role: ROLES.ADMIN, ativo: false }, PERMISSIONS.MANAGE_USERS), false);
});
