import test from 'node:test';
import assert from 'node:assert/strict';
import { getAppointmentServiceChanges, sortAppointmentServiceHistory } from '../src/utils/appointmentServiceHistory.js';

test('descreve serviços adicionados e removidos usando nomes do catálogo', () => {
  const result = getAppointmentServiceChanges({ servicosAnteriores: ['a', 'b'], servicosNovos: ['b', 'c'] }, [{ id: 'a', nome: 'Passe' }, { id: 'c', nome: 'Consulta' }]);
  assert.deepEqual(result, { added: ['Consulta'], removed: ['Passe'] });
});

test('ordena alterações da mais recente para a mais antiga', () => {
  assert.deepEqual(sortAppointmentServiceHistory([{ id: 'antiga', criadoEm: 1 }, { id: 'nova', criadoEm: 2 }]).map(item => item.id), ['nova', 'antiga']);
});
