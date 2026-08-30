import { ESTADOS_CIVIS, SEXOS, isValidEmail, normalizeEmail, normalizeEndereco, normalizeEstadoCivil, normalizeSexo } from './pessoaForm.js';

const nullableText = value => String(value ?? '').trim() || null;
const digits = (value, limit) => String(value ?? '').replace(/\D/g, '').slice(0, limit);

export const maskSelfRegistrationCep = value => {
  const clean = digits(value, 8);
  return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
};

export const maskSelfRegistrationPhone = value => {
  const clean = digits(value, 11);
  if (!clean) return '';
  if (clean.length <= 2) return `(${clean}`;
  const areaCode = clean.slice(0, 2);
  const localNumber = clean.slice(2);
  const prefixLength = clean.length === 11 ? 5 : 4;
  return localNumber.length > prefixLength
    ? `(${areaCode}) ${localNumber.slice(0, prefixLength)}-${localNumber.slice(prefixLength)}`
    : `(${areaCode}) ${localNumber}`;
};

export const buildMemberSelfRegistrationPayload = (invite, data = {}) => ({
  inviteId: invite.id,
  nome: String(invite.nome || '').trim(),
  cpf: String(invite.cpf || ''),
  dataNascimento: nullableText(data.dataNascimento),
  contato: digits(data.contato, 11) || null,
  email: normalizeEmail(data.email) || null,
  sexo: normalizeSexo(data.sexo),
  estadoCivil: normalizeEstadoCivil(data.estadoCivil),
  endereco: normalizeEndereco(data.endereco),
  statusCadastro: 'aguardando_validacao',
  origemCadastro: 'autocadastro',
});

export const validateMemberSelfRegistrationPayload = data => {
  if (!data?.inviteId || !/^[a-f0-9]{64}$/.test(data.inviteId)) return 'AUTOCADASTRO_INVALIDO';
  if (!data.nome || !data.cpf) return 'AUTOCADASTRO_INVALIDO';
  if (data.contato && !/^[0-9]{1,11}$/.test(data.contato)) return 'AUTOCADASTRO_CONTATO_INVALIDO';
  if (data.email && !isValidEmail(data.email)) return 'AUTOCADASTRO_EMAIL_INVALIDO';
  if (!SEXOS.includes(data.sexo) || !ESTADOS_CIVIS.includes(data.estadoCivil)) return 'AUTOCADASTRO_INVALIDO';
  if (data.dataNascimento && !/^\d{4}-\d{2}-\d{2}$/.test(data.dataNascimento)) return 'AUTOCADASTRO_DATA_INVALIDA';
  if (data.endereco.cep && data.endereco.cep.length !== 8) return 'AUTOCADASTRO_CEP_INVALIDO';
  if (data.endereco.uf && !/^[A-Z]{2}$/.test(data.endereco.uf)) return 'AUTOCADASTRO_UF_INVALIDA';
  return null;
};
