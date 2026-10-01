import { createHash } from 'node:crypto';
import { isValidCpf, normalizeCpf } from './cpfValidation.js';
import { normalizeAddressText, normalizeDisplayName, normalizeEmailText } from './textCase.js';

export const PRIVACY_NOTICE_VERSION = '2026-09-14.1';
export const IMAGE_CONSENT_VERSION = '2026-09-29.1';
const cleanText = (value, limit = 150) => String(value || '').trim().slice(0, limit) || null;
const cleanDigits = (value, limit) => String(value || '').replace(/\D/g, '').slice(0, limit) || null;
const validEmail = value => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizeEmailText(value));
const allowedSex = new Set(['masculino', 'feminino', 'outro', 'nao_informado']);
const allowedCivilStatus = new Set(['solteiro', 'casado', 'uniao_estavel', 'separado', 'divorciado', 'viuvo', 'outro', 'nao_informado']);

export const hashPublicIdentity = value => createHash('sha256').update(String(value || '')).digest('hex');

export const buildSecureRegistrationPayload = ({ linkId, link, data }) => {
  const member = link.tipoCadastro === 'membro'; const cpf = normalizeCpf(data?.cpf); const email = normalizeEmailText(data?.email) || null; const address = normalizeAddressText(data?.endereco);
  const payload = {
    linkId, tipoCadastro: link.tipoCadastro, nome: normalizeDisplayName(cleanText(data?.nome)), cpf, contato: cleanDigits(data?.contato, 11), email,
    dataNascimento: /^\d{4}-\d{2}-\d{2}$/.test(String(data?.dataNascimento || '')) ? data.dataNascimento : null,
    sexo: allowedSex.has(data?.sexo) ? data.sexo : 'nao_informado', estadoCivil: allowedCivilStatus.has(data?.estadoCivil) ? data.estadoCivil : 'nao_informado',
    endereco: { cep: cleanText(address.cep, 10), logradouro: cleanText(address.logradouro), numero: cleanText(address.numero, 30), complemento: cleanText(address.complemento), bairro: cleanText(address.bairro), cidade: cleanText(address.cidade), uf: cleanText(address.uf, 2)?.toUpperCase() || null },
    dadosCasa: member ? { dataIngresso: cleanText(data?.dadosCasa?.dataIngresso, 10), batizadoCaesf: data?.dadosCasa?.batizadoCaesf, dataBatismoCaesf: cleanText(data?.dadosCasa?.dataBatismoCaesf, 10) } : { dataIngresso: null, batizadoCaesf: false, dataBatismoCaesf: null },
    aceite: { versao: PRIVACY_NOTICE_VERSION, avisoPrivacidade: data?.aceite?.avisoPrivacidade === true, declaracaoVeracidade: data?.aceite?.declaracaoVeracidade === true, emailConfirmado: member },
    ...(member ? { consentimentoImagem: { autorizado: data?.consentimentoImagem === true, versao: IMAGE_CONSENT_VERSION } } : {}),
    ...(member ? { verificacaoEmailId: cleanText(data?.verificacaoEmailId, 30) } : {}), statusCadastro: 'aguardando_validacao', origemCadastro: 'link_reutilizavel',
  };
  if (!payload.nome) throw new Error('NOME_OBRIGATORIO');
  if (!/^\d{10,11}$/.test(payload.contato || '')) throw new Error('CONTATO_OBRIGATORIO');
  if (!isValidCpf(cpf)) throw new Error('CPF_INVALIDO');
  if (member && !validEmail(email)) throw new Error('EMAIL_OBRIGATORIO');
  if (email && !validEmail(email)) throw new Error('EMAIL_INVALIDO');
  if (!payload.aceite.avisoPrivacidade) throw new Error('AVISO_PRIVACIDADE_OBRIGATORIO');
  if (!payload.aceite.declaracaoVeracidade) throw new Error('DECLARACAO_VERACIDADE_OBRIGATORIA');
  if (member && !/^[A-Za-z0-9]{20}$/.test(payload.verificacaoEmailId || '')) throw new Error('EMAIL_NAO_CONFIRMADO');
  if (member && typeof payload.dadosCasa.batizadoCaesf !== 'boolean') throw new Error('AUTOCADASTRO_BATIZADO_OBRIGATORIO');
  if (member && payload.dadosCasa.batizadoCaesf && !/^\d{4}-\d{2}-\d{2}$/.test(payload.dadosCasa.dataBatismoCaesf || '')) throw new Error('AUTOCADASTRO_DATA_BATISMO_OBRIGATORIA');
  return payload;
};

export const isRateLimitExceeded = ({ count = 0, windowStartedAt = 0, now = Date.now(), windowMs, maximum }) => now - windowStartedAt < windowMs && count >= maximum;
