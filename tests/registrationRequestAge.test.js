import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRegistrationRequestsByPriority, getRegistrationRequestWaitingInfo } from '../src/utils/registrationRequestAge.js';

const stamp = value => ({ toMillis: () => value });

test('calcula espera e considera atraso somente após sete dias completos', () => {
  const now = 10 * 86400000;
  assert.equal(getRegistrationRequestWaitingInfo({ statusCadastro: 'aguardando_validacao', enviadoEm: stamp(now - 86400000) }, now).label, 'Aguardando há 1 dia');
  assert.equal(getRegistrationRequestWaitingInfo({ statusCadastro: 'aguardando_validacao', enviadoEm: stamp(now - 7 * 86400000) }, now).overdue, false);
  assert.equal(getRegistrationRequestWaitingInfo({ statusCadastro: 'aguardando_validacao', enviadoEm: stamp(now - 8 * 86400000) }, now).overdue, true);
  assert.equal(getRegistrationRequestWaitingInfo({ statusCadastro: 'aprovado', enviadoEm: stamp(0) }, now), null);
});

test('prioriza pendências mais antigas e mantém analisadas recentes primeiro', () => {
  const oldPending = { statusCadastro: 'aguardando_validacao', enviadoEm: stamp(1) };
  const newPending = { statusCadastro: 'aguardando_validacao', enviadoEm: stamp(2) };
  const approved = { statusCadastro: 'aprovado', enviadoEm: stamp(3) };
  assert.deepEqual([approved, newPending, oldPending].sort(compareRegistrationRequestsByPriority), [oldPending, newPending, approved]);
});
