export const buildBookVerificationUrl = (origin, verificationCode) => {
  const base = String(origin || '').replace(/\/$/, '');
  const code = String(verificationCode || '').trim().toUpperCase();
  return `${base}/verificar-livro?codigo=${encodeURIComponent(code)}`;
};
