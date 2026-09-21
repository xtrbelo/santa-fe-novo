import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_APPOINTMENT_OBSERVATION_LENGTH, normalizeAppointmentObservation } from '../src/utils/appointmentObservation.js';

test('observação do agendamento é opcional e remove espaços externos', () => {
  assert.equal(normalizeAppointmentObservation(''), '');
  assert.equal(normalizeAppointmentObservation('  Retorno após orientação  '), 'Retorno após orientação');
});

test('observação aceita até 500 caracteres', () => {
  assert.equal(MAX_APPOINTMENT_OBSERVATION_LENGTH, 500);
  assert.equal(normalizeAppointmentObservation('a'.repeat(500)).length, 500);
  assert.throws(() => normalizeAppointmentObservation('a'.repeat(501)), /OBSERVACAO_MUITO_LONGA/);
});
