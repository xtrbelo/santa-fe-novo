import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAgendaOccupancy, inspectAgendaOccupancy, vacancyMapsEqual } from '../src/utils/vacancyReconciliation.js';

const agenda = { vagasTotais: { passe: 4, consulta: 2 }, vagasOcupadas: { passe: 1, consulta: 0 } };

test('calcula vagas pelos atendimentos que ainda ocupam capacidade', () => {
  const appointments = [
    { status: 'Agendado', servicosIds: ['passe', 'consulta'] },
    { status: 'Presente', servicosIds: ['passe'] },
    { status: 'Faltou', servicosIds: ['consulta'] },
    { status: 'Cancelado', servicosIds: ['passe'] },
    { status: 'Concluído', servicosIds: ['passe'] },
    { status: 'Reagendado', servicosIds: ['consulta'] },
  ];
  assert.deepEqual(calculateAgendaOccupancy(agenda, appointments), { passe: 2, consulta: 2 });
});

test('ignora serviços já realocados e serviços sem controle de vagas', () => {
  const appointments = [{ status: 'Agendado', servicosIds: ['passe', 'livre'], servicosRealocados: { passe: { destinoAgendaId: 'outra' } } }];
  assert.deepEqual(calculateAgendaOccupancy(agenda, appointments), { passe: 0, consulta: 0 });
});

test('compara mapas numericamente e identifica divergência', () => {
  assert.equal(vacancyMapsEqual({ passe: 1 }, { passe: 1, consulta: 0 }), true);
  assert.equal(inspectAgendaOccupancy(agenda, [{ status: 'Agendado', servicosIds: ['passe'] }]).divergent, false);
  assert.equal(inspectAgendaOccupancy(agenda, []).divergent, true);
});
