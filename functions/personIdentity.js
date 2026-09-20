const normalizeEmail = value => String(value || '').trim().toLowerCase();
const memberType = person => String(person?.vinculo || person?.tipoPessoa || '').trim().toLowerCase();

export const isActiveMemberIdentity = person => Boolean(person) && person.ativo !== false && memberType(person) === 'membro';
export const getMemberEmailIndexId = email => encodeURIComponent(normalizeEmail(email));

export const findActiveMemberEmailConflict = ({ personId = null, person, people = [] }) => {
  if (!isActiveMemberIdentity(person)) return null;
  const email = normalizeEmail(person.email);
  if (!email || !/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)) throw new Error('EMAIL_MEMBRO_INVALIDO');
  return people.find(item => item.id !== personId && isActiveMemberIdentity(item) && normalizeEmail(item.email) === email) || null;
};

export const assertMemberEmailAvailable = ({ personId = null, person, people = [], index = null }) => {
  const conflict = findActiveMemberEmailConflict({ personId, person, people });
  if (conflict || (isActiveMemberIdentity(person) && index && index.pessoaId !== personId)) {
    const error = new Error('EMAIL_MEMBRO_DUPLICADO');
    error.existingPersonName = conflict?.nome || null;
    throw error;
  }
};

export const validateSecurePersonPayload = data => {
  const vinculo = data?.vinculo;
  const nome = String(data?.nome || '').trim();
  if (!['membro', 'consulente'].includes(vinculo) || !nome) throw new Error('PESSOA_INVALIDA');
  if (vinculo === 'membro') {
    if (!/^\d{11}$/.test(String(data.cpf || ''))) throw new Error('CPF_MEMBRO_INVALIDO');
    if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(normalizeEmail(data.email))) throw new Error('EMAIL_MEMBRO_INVALIDO');
  }
};
