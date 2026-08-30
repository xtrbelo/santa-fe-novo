export const MEMBER_INVITE_EXPIRATION_DAYS = 7;
export const MEMBER_INVITE_TOKEN_BYTES = 32;

const cryptoApi = () => {
  if (!globalThis.crypto?.getRandomValues || !globalThis.crypto?.subtle) throw new Error('CRYPTO_INDISPONIVEL');
  return globalThis.crypto;
};

const bytesToBase64Url = bytes => {
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const generateMemberInviteToken = () => {
  const bytes = new Uint8Array(MEMBER_INVITE_TOKEN_BYTES);
  cryptoApi().getRandomValues(bytes);
  return bytesToBase64Url(bytes);
};

export const hashMemberInviteToken = async token => {
  const digest = await cryptoApi().subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const isValidMemberInviteToken = token => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

export const buildMemberInviteUrl = (token, origin = globalThis.location?.origin) => {
  if (!origin) throw new Error('ORIGEM_INDISPONIVEL');
  return `${String(origin).replace(/\/$/, '')}/autocadastro?token=${encodeURIComponent(token)}`;
};

export const getMemberInviteExpiration = (now = new Date()) => new Date(now.getTime() + MEMBER_INVITE_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

const toMillis = value => typeof value?.toMillis === 'function' ? value.toMillis() : value instanceof Date ? value.getTime() : Number(value);
export const getMemberInviteEffectiveStatus = (invite, now = Date.now()) => {
  if (invite?.status === 'revogado') return 'revogado';
  if (invite?.status === 'respondido') return 'respondido';
  return toMillis(invite?.expiraEm) <= toMillis(now) ? 'expirado' : 'ativo';
};

export const buildMemberInviteWhatsAppMessage = ({ nome, url }) =>
  `Olá, ${String(nome || '').trim()}! Você recebeu um convite para realizar seu autocadastro no Santa Fé. Acesse o link: ${url}`;

export const buildMemberInviteWhatsAppUrl = invite =>
  `https://wa.me/?text=${encodeURIComponent(buildMemberInviteWhatsAppMessage(invite))}`;
