import { getServicosAtivosAtendimento } from './domain.js';

const OCCUPYING_STATUSES = new Set(['Agendado', 'Presente', 'Faltou']);

export const calculateAgendaOccupancy = (agenda, appointments = []) => {
  const serviceIds = Object.keys(agenda?.vagasTotais || {});
  const occupancy = Object.fromEntries(serviceIds.map(id => [id, 0]));
  appointments.filter(item => OCCUPYING_STATUSES.has(item.status)).forEach(item => {
    getServicosAtivosAtendimento(item).forEach(serviceId => {
      if (Object.hasOwn(occupancy, serviceId)) occupancy[serviceId] += 1;
    });
  });
  return occupancy;
};

export const vacancyMapsEqual = (left = {}, right = {}) => {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return keys.every(key => Number(left[key] || 0) === Number(right[key] || 0));
};

export const inspectAgendaOccupancy = (agenda, appointments = []) => {
  const current = agenda?.vagasOcupadas || {};
  const expected = calculateAgendaOccupancy(agenda, appointments);
  return { current, expected, divergent: !vacancyMapsEqual(current, expected) };
};
