import { getPessoaVinculo } from './domain.js';
import { isValidEmail, normalizeEmail } from './pessoaForm.js';

const isActiveMember = person => person?.ativo !== false && getPessoaVinculo(person) === 'membro';
const summarizePerson = person => ({ pessoaId: person.id, nome: person.nome || 'Membro sem nome', email: normalizeEmail(person.email) });

export const inspectMemberEmailIndexData = ({ people = [], indexes = [] } = {}) => {
  const activeMembers = people.filter(isActiveMember);
  const invalid = activeMembers.filter(person => !isValidEmail(person.email)).map(summarizePerson);
  const groups = new Map();

  activeMembers.filter(person => isValidEmail(person.email)).forEach(person => {
    const email = normalizeEmail(person.email);
    groups.set(email, [...(groups.get(email) || []), person]);
  });

  const indexesById = new Map(indexes.map(index => [index.id, index]));
  const conflicts = [];
  const missing = [];
  const indexConflicts = [];
  let correct = 0;

  groups.forEach((members, email) => {
    if (members.length > 1) {
      conflicts.push({ email, people: members.map(summarizePerson) });
      return;
    }
    const person = members[0];
    const expectedId = encodeURIComponent(email);
    const index = indexesById.get(expectedId);
    if (!index) missing.push(summarizePerson(person));
    else if (index.pessoaId !== person.id) indexConflicts.push({ ...summarizePerson(person), indexedPessoaId: index.pessoaId || null });
    else correct += 1;
  });

  const peopleById = new Map(people.map(person => [person.id, person]));
  const orphanIndexes = indexes.filter(index => {
    const person = peopleById.get(index.pessoaId);
    if (!isActiveMember(person) || !isValidEmail(person?.email)) return true;
    return index.id !== encodeURIComponent(normalizeEmail(person.email));
  }).map(index => ({ indexId: index.id, pessoaId: index.pessoaId || null }));

  return {
    analyzed: activeMembers.length,
    correct,
    missing,
    conflicts,
    indexConflicts,
    invalid,
    orphanIndexes,
  };
};
