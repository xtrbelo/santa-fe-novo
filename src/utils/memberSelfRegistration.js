import { ESTADOS_CIVIS, SEXOS, isValidEmail, normalizeDadosCasa, normalizeEmail, normalizeEndereco, normalizeEstadoCivil, normalizeSexo } from './pessoaForm.js';

const nullableText = value => String(value ?? '').trim() || null;
const digits = (value, limit) => String(value ?? '').replace(/\D/g, '').slice(0, limit);
const isIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00`));
const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const validateSelfRegistrationHouseData = (dadosCasa, today = todayIso()) => {
  const normalized = normalizeDadosCasa(dadosCasa);
  if (normalized.dataIngresso && !isIsoDate(normalized.dataIngresso)) return 'AUTOCADASTRO_DATA_INGRESSO_INVALIDA';
  if (typeof normalized.batizadoCaesf !== 'boolean') return 'AUTOCADASTRO_BATIZADO_OBRIGATORIO';
  if (normalized.batizadoCaesf && !isIsoDate(normalized.dataBatismoCaesf)) return 'AUTOCADASTRO_DATA_BATISMO_OBRIGATORIA';
  if (normalized.dataIngresso && normalized.dataIngresso > today) return 'AUTOCADASTRO_DATA_INGRESSO_FUTURA';
  if (normalized.dataBatismoCaesf && normalized.dataBatismoCaesf > today) return 'AUTOCADASTRO_DATA_BATISMO_FUTURA';
  if (normalized.dataIngresso && normalized.dataBatismoCaesf && normalized.dataBatismoCaesf < normalized.dataIngresso) return 'AUTOCADASTRO_BATISMO_ANTERIOR_INGRESSO';
  return null;
};

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
  dadosCasa: normalizeDadosCasa(data.dadosCasa),
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
  const houseDataError = validateSelfRegistrationHouseData(data.dadosCasa);
  if (houseDataError) return houseDataError;
  return null;
};
