const CONNECTION_CODES = new Set([
  'unavailable',
  'network-request-failed',
  'deadline-exceeded',
]);

const normalizedCode = error => String(error?.code || '').split('/').at(-1);

export const getFriendlyErrorMessage = (error, { fallback, businessMessages = {} }) => {
  const technicalMessage = String(error?.message || '');
  const businessKey = Object.keys(businessMessages).find(key => technicalMessage.includes(key));
  if (businessKey) return businessMessages[businessKey];
  const code = normalizedCode(error);
  if (code === 'permission-denied') return 'Você não possui permissão para realizar esta operação.';
  if (code === 'unauthenticated') return 'Sua sessão não está válida. Saia e entre novamente.';
  if (CONNECTION_CODES.has(code)) return 'Não foi possível conectar ao serviço. Verifique sua internet e tente novamente.';
  if (code === 'resource-exhausted') return 'O serviço está temporariamente ocupado. Aguarde e tente novamente.';
  return fallback;
};
