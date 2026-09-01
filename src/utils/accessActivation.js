import { isValidEmail, normalizeEmail } from './pessoaForm.js';

export const ACCESS_ACTIVATION_PATH = '/ativar-acesso';
export const MIN_ACCESS_PASSWORD_LENGTH = 8;

export const buildAccessActivationActionCodeSettings = origin => ({
  url: new URL(ACCESS_ACTIVATION_PATH, origin).toString(),
  handleCodeInApp: true,
});

export const validateAccessActivationPassword = (password, confirmation) => {
  if (String(password || '').length < MIN_ACCESS_PASSWORD_LENGTH) return 'SENHA_FRACA';
  if (password !== confirmation) return 'SENHAS_DIVERGENTES';
  return null;
};

export const normalizeAccessActivationEmail = email => {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) throw new Error('EMAIL_ATIVACAO_INVALIDO');
  return normalized;
};
