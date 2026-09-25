import { getPessoaFuncoesCasa, getPessoaVinculo } from './domain.js';

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export const buildAttendanceWorkerGroups = (people, configurations = []) => {
  const roleIds = { medium: new Set(['medium']), cambone: new Set(['cambone']) };
  configurations.filter(item => item.ativo !== false).forEach(item => {
    const id = String(item.codigo || item.slug || item.id || '').trim();
    const name = normalize(item.nome || id);
    if (id && name === 'medium') roleIds.medium.add(id);
    if (id && name === 'cambone') roleIds.cambone.add(id);
  });
  const activeMembers = (people || []).filter(person => person.ativo !== false && getPessoaVinculo(person) === 'membro');
  const matches = (person, role) => getPessoaFuncoesCasa(person).some(id => roleIds[role].has(id)) || normalize(person.tipoPessoa).includes(role);
  const sort = list => list.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  return { mediuns: sort(activeMembers.filter(person => matches(person, 'medium'))), cambones: sort(activeMembers.filter(person => matches(person, 'cambone'))) };
};
