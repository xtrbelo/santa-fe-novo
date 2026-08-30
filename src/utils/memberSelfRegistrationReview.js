import { buildPessoaPayload, validatePessoaPayload } from './pessoaForm.js';
import { validateCPF } from './formatters.js';

export const SELF_REGISTRATION_STATUS = Object.freeze({
  PENDING: 'aguardando_validacao',
  APPROVED: 'aprovado',
  REJECTED: 'rejeitado',
});

export const buildPessoaFromSelfRegistration = registration => buildPessoaPayload({
  vinculo: 'membro',
  tipoPessoa: 'Membro',
  nome: registration?.nome,
  cpf: registration?.cpf,
  dataNascimento: registration?.dataNascimento,
  contato: registration?.contato,
  email: registration?.email,
  sexo: registration?.sexo,
  estadoCivil: registration?.estadoCivil,
  endereco: registration?.endereco,
  dadosCasa: {},
  funcoesCasa: [],
  ativo: true,
  statusCadastro: SELF_REGISTRATION_STATUS.APPROVED,
  origemCadastro: 'autocadastro',
});

export const validateSelfRegistrationApproval = registration => {
  if (!registration || registration.statusCadastro !== SELF_REGISTRATION_STATUS.PENDING) return 'AUTOCADASTRO_JA_ANALISADO';
  if (!registration.inviteId || !/^[a-f0-9]{64}$/.test(registration.inviteId)) return 'AUTOCADASTRO_INVALIDO';
  if (!validateCPF(registration.cpf)) return 'AUTOCADASTRO_INVALIDO';
  const pessoa = buildPessoaFromSelfRegistration(registration);
  const error = validatePessoaPayload(pessoa);
  return error ? `AUTOCADASTRO_INVALIDO:${error}` : null;
};

export const normalizeRejectionReason = value => String(value || '').trim();

export const validateSelfRegistrationRejection = (registration, reason) => {
  if (!registration || registration.statusCadastro !== SELF_REGISTRATION_STATUS.PENDING) return 'AUTOCADASTRO_JA_ANALISADO';
  if (!registration.inviteId || !/^[a-f0-9]{64}$/.test(registration.inviteId)) return 'AUTOCADASTRO_INVALIDO';
  if (!normalizeRejectionReason(reason)) return 'MOTIVO_REJEICAO_OBRIGATORIO';
  return null;
};

export const canReviewSelfRegistration = registration => registration?.statusCadastro === SELF_REGISTRATION_STATUS.PENDING;
