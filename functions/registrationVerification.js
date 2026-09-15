import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

export const normalizeVerificationEmail = value => String(value || '').trim().toLowerCase();
export const isVerificationEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeVerificationEmail(value));
export const createVerificationCode = () => String(randomInt(0, 1000000)).padStart(6, '0');
export const hashVerificationCode = ({ verificationId, code }) => createHash('sha256').update(`${verificationId}:${String(code || '')}`).digest('hex');
export const hashVerificationIdentity = ({ linkId, email }) => createHash('sha256').update(`${linkId}:${normalizeVerificationEmail(email)}`).digest('hex');
export const verificationCodeMatches = ({ verificationId, code, expectedHash }) => {
  const actual = Buffer.from(hashVerificationCode({ verificationId, code }));
  const expected = Buffer.from(String(expectedHash || ''));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
export const buildRegistrationVerificationEmail = code => ({
  subject: 'Código de confirmação — Casa Santa Fé',
  text: `Seu código de confirmação é ${code}. Ele expira em 10 minutos. Se você não solicitou este cadastro, ignore esta mensagem.`,
  html: `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6"><p style="font-size:12px;font-weight:bold;color:#6d28d9;text-transform:uppercase">Casa Santa Fé</p><h1 style="font-size:22px;color:#111827">Confirme seu e-mail</h1><p>Use o código abaixo para confirmar seu cadastro:</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#6d28d9">${code}</p><p>O código expira em 10 minutos.</p><p style="font-size:12px;color:#6b7280">Se você não solicitou este cadastro, ignore esta mensagem.</p></div>`,
});

const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => !['resumoConteudo', 'registradoEm'].includes(key)).map(key => [key, stable(value[key])]));
  return value;
};
export const buildRegistrationEvidenceHash = registration => createHash('sha256').update(JSON.stringify(stable(registration))).digest('hex');
