import { getPessoaFuncoesCasa, getPessoaVinculo } from './domain.js';

export const getMissingPersonFields = person => {
  const missing = [];
  if (!String(person?.nome || '').trim()) missing.push('Nome');
  if (!String(person?.cpf || '').trim()) missing.push('CPF');
  if (!String(person?.contato || '').trim()) missing.push('Contato');
  if (getPessoaVinculo(person) === 'membro') {
    if (!String(person?.email || '').trim()) missing.push('E-mail');
    if (!String(person?.dataNascimento || '').trim()) missing.push('Data de nascimento');
    const address = person?.endereco || {};
    if (!String(address.cep || '').trim()) missing.push('CEP');
    if (!String(address.logradouro || '').trim()) missing.push('Logradouro');
    if (!String(address.numero || '').trim()) missing.push('Número');
    if (!String(address.bairro || '').trim()) missing.push('Bairro');
    if (!String(address.cidade || '').trim()) missing.push('Cidade');
    if (!String(address.uf || '').trim()) missing.push('UF');
    if (!getPessoaFuncoesCasa(person).length) missing.push('Função na Casa');
  }
  return missing;
};

export const filterPeople = (people, { type = 'todos', situation = 'ativos', functionId = 'todas', completeness = 'todos', search = '', matchesSearch = () => true } = {}) => people.filter(person => {
  const typeMatches = type === 'todos' || getPessoaVinculo(person) === type;
  const situationMatches = situation === 'todos' || (situation === 'ativos' ? person.ativo !== false : person.ativo === false);
  const functionMatches = functionId === 'todas' || (getPessoaVinculo(person) === 'membro' && getPessoaFuncoesCasa(person).includes(functionId));
  const incomplete = getMissingPersonFields(person).length > 0;
  const completenessMatches = completeness === 'todos' || (completeness === 'incompletos' ? incomplete : !incomplete);
  return typeMatches && situationMatches && functionMatches && completenessMatches && matchesSearch(person, search);
});
