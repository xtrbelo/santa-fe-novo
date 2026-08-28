export const PESSOA_SEARCH_VERSION = 1;
export const MAX_PESSOA_SEARCH_TERMS = 180;

export const normalizeSearchText = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/\s+/g, ' ');

export const normalizeSearchDigits = value => String(value || '').replace(/\D/g, '');

const addPrefixes = (set, value, maximum) => {
  const limited = value.slice(0, maximum);
  for (let length = 2; length <= limited.length; length += 1) set.add(limited.slice(0, length));
};

export const buildPessoaSearchTerms = pessoa => {
  const terms = new Set();
  const nome = normalizeSearchText(pessoa?.nome);
  nome.split(' ').filter(Boolean).forEach(word => addPrefixes(terms, word, 20));
  addPrefixes(terms, nome, 50);

  const cpf = normalizeSearchDigits(pessoa?.cpf);
  if (cpf) terms.add(cpf);

  const telefone = normalizeSearchDigits(pessoa?.contato || pessoa?.telefone);
  if (telefone) {
    terms.add(telefone);
    for (let length = Math.min(9, telefone.length - 1); length >= 4; length -= 1) {
      terms.add(telefone.slice(-length));
    }
  }
  return [...terms].slice(0, MAX_PESSOA_SEARCH_TERMS);
};

export const buildPessoaSearchIndex = pessoa => ({
  versao: PESSOA_SEARCH_VERSION,
  nome: normalizeSearchText(pessoa?.nome),
  telefone: normalizeSearchDigits(pessoa?.contato || pessoa?.telefone),
  termos: buildPessoaSearchTerms(pessoa)
});
