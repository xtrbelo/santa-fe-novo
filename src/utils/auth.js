export const normalizeAuthEmail = email => String(email || '').trim().toLowerCase();

export const validateRegistration = ({ nome, email, senha, confirmarSenha }) => {
  if (!String(nome || '').trim()) return 'Informe seu nome.';
  if (!normalizeAuthEmail(email)) return 'Informe seu e-mail.';
  if (String(senha || '').length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
  if (senha !== confirmarSenha) return 'As senhas não coincidem.';
  return null;
};

export const getAuthErrorMessage = error => {
  const messages = {
    'auth/invalid-credential': 'Não foi possível entrar. Confira e-mail e senha.',
    'auth/wrong-password': 'Não foi possível entrar. Confira e-mail e senha.',
    'auth/user-not-found': 'Não foi possível entrar. Confira e-mail e senha.',
    'auth/email-already-in-use': 'Já existe uma conta utilizando este e-mail. Tente entrar com o método utilizado originalmente ou recupere sua senha.',
    'auth/account-exists-with-different-credential': 'Já existe uma conta utilizando este e-mail. Tente entrar com o método utilizado originalmente ou recupere sua senha.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/weak-password': 'Senha muito fraca. Use pelo menos 8 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
    'auth/network-request-failed': 'Não foi possível conectar. Verifique sua internet.',
    'auth/popup-closed-by-user': 'A entrada com Google foi cancelada.'
  };
  return messages[error?.code] || 'Não foi possível concluir a autenticação. Tente novamente.';
};

export const usesPasswordProvider = user => user?.providerData?.some(provider => provider.providerId === 'password') === true;
