export const MAX_APPOINTMENT_OBSERVATION_LENGTH = 500;

export const normalizeAppointmentObservation = value => {
  const observation = String(value || '').trim();
  if (observation.length > MAX_APPOINTMENT_OBSERVATION_LENGTH) throw new Error('OBSERVACAO_MUITO_LONGA');
  return observation;
};
