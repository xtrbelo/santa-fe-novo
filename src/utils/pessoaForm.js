import { normalizeSearchText } from './pessoaSearch.js';

export const FALLBACK_FUNCOES_MEMBRO = [
  { id: 'medium', nome: 'Médium' },
  { id: 'cambone', nome: 'Cambone' }
];

export const getEffectiveMemberFunctions = configuredFunctions => {
  const byId = new Map(FALLBACK_FUNCOES_MEMBRO.map(item => [item.id, { ...item }]));
  (configuredFunctions || []).filter(item => item?.ativo !== false).forEach(item => {
    const id = String(item.codigo || item.slug || item.id || '').trim();
    if (id && item.nome) byId.set(id, { id, nome: String(item.nome).trim() });
  });
  return [...byId.values()];
};

export const getMemberFunctionLabels = (codes, effectiveFunctions) => {
  const labels = new Map(getEffectiveMemberFunctions(effectiveFunctions).map(item => [item.id, item.nome]));
  return (codes || []).map(code => labels.get(code) || code);
};

export const normalizeEmail = value => String(value || '').trim().toLowerCase();
export const isValidEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

export const buildPessoaPayload = data => {
  const vinculo = data.vinculo === 'membro' ? 'membro' : 'consulente';
  return {
    ...data,
    vinculo,
    tipoPessoa: vinculo === 'membro' ? 'Membro' : 'Consulente',
    funcoesCasa: vinculo === 'membro' ? [...new Set(data.funcoesCasa || [])] : [],
    nome: String(data.nome || '').trim(),
    email: normalizeEmail(data.email) || null
  };
};

export const validatePessoaPayload = data => {
  const pessoa = buildPessoaPayload(data);
  if (!pessoa.nome) return 'O nome é obrigatório.';
  if (pessoa.vinculo === 'membro' && !pessoa.cpf) return 'O CPF é obrigatório para Membro.';
  if (pessoa.vinculo === 'membro' && !pessoa.email) return 'O e-mail é obrigatório para Membro.';
  if (pessoa.email && !isValidEmail(pessoa.email)) return 'Informe um e-mail válido.';
  return null;
};

export const localTextIncludes = (value, term) => normalizeSearchText(value).includes(normalizeSearchText(term));
