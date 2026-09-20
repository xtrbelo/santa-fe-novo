const OPERATIONAL_ROLES = new Set(['admin', 'gestor', 'atendimento']);

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const personType = person => String(person?.vinculo || person?.tipoPessoa || '').trim().toLowerCase();
const activeMember = person => Boolean(person) && person.ativo !== false && personType(person) === 'membro';

const issue = (user, code, details = {}) => ({
  uid: user.uid || user.id,
  nome: user.nome || 'Usuário sem nome',
  email: normalizeEmail(user.email),
  role: user.role,
  pessoaBaseId: user.pessoaBaseId || null,
  code,
  ...details,
});

export const inspectAccessIntegrityData = ({ users = [], people = [], indexes = [] }) => {
  const peopleById = new Map(people.map(person => [person.id, person]));
  const usersByUid = new Map(users.map(user => [user.uid || user.id, user]));
  const indexesByPerson = new Map(indexes.map(index => [index.id || index.pessoaBaseId, index]));
  const activeMembersByEmail = new Map();

  for (const person of people) {
    if (!activeMember(person)) continue;
    const email = normalizeEmail(person.email);
    if (!email) continue;
    const matches = activeMembersByEmail.get(email) || [];
    matches.push(person);
    activeMembersByEmail.set(email, matches);
  }

  const issues = [];
  let correct = 0;
  for (const user of users.filter(item => item.ativo !== false && OPERATIONAL_ROLES.has(item.role))) {
    const linkedPerson = user.pessoaBaseId ? peopleById.get(user.pessoaBaseId) : null;
    const linkedIndex = user.pessoaBaseId ? indexesByPerson.get(user.pessoaBaseId) : null;
    let code = null;

    if (!user.pessoaBaseId) code = 'SEM_VINCULO';
    else if (!linkedPerson) code = 'PESSOA_INEXISTENTE';
    else if (linkedPerson.ativo === false) code = 'PESSOA_INATIVA';
    else if (personType(linkedPerson) !== 'membro') code = 'PESSOA_NAO_MEMBRO';
    else if (normalizeEmail(linkedPerson.email) !== normalizeEmail(user.email)) code = 'EMAIL_DIVERGENTE';
    else if (!linkedIndex) code = 'INDICE_AUSENTE';
    else if (linkedIndex.uid !== (user.uid || user.id)) code = 'INDICE_DIVERGENTE';

    if (!code) {
      correct += 1;
      continue;
    }

    let suggestedPessoaId = null;
    if (code === 'INDICE_AUSENTE') suggestedPessoaId = linkedPerson.id;
    if (['SEM_VINCULO', 'PESSOA_INEXISTENTE'].includes(code)) {
      const candidates = activeMembersByEmail.get(normalizeEmail(user.email)) || [];
      if (candidates.length === 1) {
        const candidateIndex = indexesByPerson.get(candidates[0].id);
        if (!candidateIndex || candidateIndex.uid === (user.uid || user.id)) suggestedPessoaId = candidates[0].id;
      }
    }

    issues.push(issue(user, code, {
      linkedPersonName: linkedPerson?.nome || null,
      suggestedPessoaId,
      suggestedPersonName: suggestedPessoaId ? peopleById.get(suggestedPessoaId)?.nome || null : null,
      repairable: Boolean(suggestedPessoaId),
    }));
  }

  const orphanIndexes = indexes.filter(index => {
    const pessoaId = index.id || index.pessoaBaseId;
    const user = usersByUid.get(index.uid);
    return !peopleById.has(pessoaId) || !user || user.pessoaBaseId !== pessoaId;
  }).map(index => ({
    pessoaBaseId: index.id || index.pessoaBaseId,
    uid: index.uid || null,
    personExists: peopleById.has(index.id || index.pessoaBaseId),
    userExists: usersByUid.has(index.uid),
  }));

  const emailConflicts = [...activeMembersByEmail.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([email, matches]) => ({
      email,
      people: matches.map(person => ({
        id: person.id,
        nome: person.nome || 'Pessoa sem nome',
        cpf: person.cpf || null,
        contato: person.contato || null,
        linkedUid: indexesByPerson.get(person.id)?.uid || null,
      })),
    }));

  return {
    analyzed: users.filter(item => item.ativo !== false && OPERATIONAL_ROLES.has(item.role)).length,
    correct,
    issues,
    repairable: issues.filter(item => item.repairable).length,
    orphanIndexes,
    emailConflicts,
  };
};

export const ACCESS_INTEGRITY_LABELS = Object.freeze({
  SEM_VINCULO: 'Usuário sem Pessoa vinculada',
  PESSOA_INEXISTENTE: 'Cadastro de Pessoa não encontrado',
  PESSOA_INATIVA: 'Pessoa vinculada está inativa',
  PESSOA_NAO_MEMBRO: 'Pessoa vinculada não é Membro',
  EMAIL_DIVERGENTE: 'E-mail do Usuário difere do Membro',
  INDICE_AUSENTE: 'Índice de vínculo ausente',
  INDICE_DIVERGENTE: 'Índice vinculado a outro Usuário',
});
