import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationalAlerts, isRegistrationOverdue } from '../src/utils/operationalAlerts.js';

test('identifica somente solicitações pendentes há pelo menos 48 horas', () => {
  const now = Date.UTC(2026, 8, 20, 12);
  assert.equal(isRegistrationOverdue({ statusCadastro: 'aguardando_validacao', criadoEm: now - 49 * 3600000 }, now), true);
  assert.equal(isRegistrationOverdue({ statusCadastro: 'aguardando_validacao', criadoEm: now - 2 * 3600000 }, now), false);
  assert.equal(isRegistrationOverdue({ statusCadastro: 'aprovado', criadoEm: now - 72 * 3600000 }, now), false);
});

test('ordena alertas operacionais pela prioridade', () => {
  const alerts = buildOperationalAlerts({ overdueRegistrations: 2, communicationFailures: 1, pendingUsers: 3 });
  assert.deepEqual(alerts.map(item => item.action), ['communications', 'registrations', 'users']);
  assert.equal(buildOperationalAlerts({}).length, 0);
});
