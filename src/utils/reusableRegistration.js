import { buildPessoaPayload, isValidEmail, normalizeDadosCasa, normalizeEmail, normalizeEndereco, normalizeEstadoCivil, normalizeSexo } from './pessoaForm.js';
import { validateCPF } from './formatters.js';
import { validateSelfRegistrationHouseData } from './memberSelfRegistration.js';

const digits = (value, limit) => String(value ?? '').replace(/\D/g, '').slice(0, limit);
const text = value => String(value ?? '').trim() || null;

export const buildReusableRegistrationPayload = (link, data = {}) => ({
  linkId: link.id,
  tipoCadastro: link.tipoCadastro,
  nome: String(data.nome || '').trim(),
  cpf: digits(data.cpf, 11) || null,
  contato: digits(data.contato, 11) || null,
  email: normalizeEmail(data.email) || null,
  dataNascimento: text(data.dataNascimento),
  sexo: normalizeSexo(data.sexo),
  estadoCivil: normalizeEstadoCivil(data.estadoCivil),
  endereco: normalizeEndereco(data.endereco),
  dadosCasa: link.tipoCadastro === 'membro' ? normalizeDadosCasa(data.dadosCasa) : { dataIngresso: null, batizadoCaesf: false, dataBatismoCaesf: null },
  statusCadastro: 'aguardando_validacao',
  origemCadastro: 'link_reutilizavel',
});

export const validateReusableRegistrationPayload = data => {
  if (!data?.linkId || !/^[a-f0-9]{64}$/.test(data.linkId) || !['membro', 'consulente'].includes(data.tipoCadastro)) return 'SOLICITACAO_INVALIDA';
  if (!data.nome || data.nome.length > 150) return 'NOME_OBRIGATORIO';
  if (data.tipoCadastro === 'consulente' && !/^[0-9]{10,11}$/.test(data.contato || '')) return 'CONTATO_OBRIGATORIO';
  if (data.tipoCadastro === 'membro' && !/^[0-9]{10,11}$/.test(data.contato || '')) return 'CONTATO_OBRIGATORIO';
  if (!validateCPF(data.cpf || '')) return 'CPF_INVALIDO';
  if (data.tipoCadastro === 'membro' && !isValidEmail(data.email || '')) return 'EMAIL_OBRIGATORIO';
  if (data.email && !isValidEmail(data.email)) return 'EMAIL_INVALIDO';
  if (data.tipoCadastro === 'membro') return validateSelfRegistrationHouseData(data.dadosCasa);
  return null;
};

export const buildConsulteeFromReusableRegistration = registration => ({
  ...buildPessoaPayload({ ...registration, vinculo: 'consulente', tipoPessoa: 'Consulente', funcoesCasa: [], ativo: true }),
  statusCadastro: 'aprovado',
  origemCadastro: 'link_reutilizavel',
});
