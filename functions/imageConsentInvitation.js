import { createHash, randomBytes } from 'node:crypto';

export const IMAGE_CONSENT_VERSION = '2026-09-29.1';
export const IMAGE_CONSENT_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const escapeHtml = value => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const firstName = value => String(value || '').trim().split(/\s+/)[0] || 'membro';

export const createImageConsentToken = () => randomBytes(32).toString('hex');
export const hashImageConsentToken = token => createHash('sha256').update(String(token || '')).digest('hex');
export const maskImageConsentEmail = value => {
  const [local = '', domain = ''] = String(value || '').trim().toLowerCase().split('@');
  if (!local || !domain) return '';
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(2, Math.min(local.length - 2, 6)))}@${domain}`;
};
export const buildImageConsentEvidenceHash = data => createHash('sha256').update(JSON.stringify({
  pessoaId: String(data?.pessoaId || ''),
  solicitacaoId: String(data?.solicitacaoId || ''),
  autorizado: data?.autorizado === true,
  versaoTermo: String(data?.versaoTermo || ''),
  respondidoEm: String(data?.respondidoEm || ''),
  email: String(data?.email || '').trim().toLowerCase(),
  canal: String(data?.canal || ''),
  facilitadorUid: String(data?.facilitadorUid || ''),
  titularUid: String(data?.titularUid || ''),
})).digest('hex');

export const buildImageConsentInvitationEmail = ({ nome, link }) => ({
  subject: 'Autorização de uso de imagem — Casa Santa Fé',
  text: `Olá, ${firstName(nome)}!\n\nA Casa Santa Fé solicita que você informe se autoriza ou não o uso institucional de sua imagem em fotos e vídeos. A decisão é opcional e pode ser alterada posteriormente.\n\nResponder solicitação: ${link}\n\nO link é pessoal e expira em 7 dias.`,
  html: `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6"><p style="font-size:12px;font-weight:bold;color:#6d28d9;text-transform:uppercase">Casa Santa Fé</p><h1 style="font-size:22px;color:#111827">Autorização de uso de imagem</h1><p>Olá, ${escapeHtml(firstName(nome))}!</p><p>Informe se autoriza ou não o uso institucional de sua imagem em fotos e vídeos. A decisão é opcional e pode ser alterada posteriormente.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;background:#6d28d9;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Responder solicitação</a></p><p style="font-size:12px;color:#6b7280">O link é pessoal e expira em 7 dias.</p></div>`,
});

export const buildImageConsentCodeEmail = ({ nome, code }) => ({
  subject: 'Código para autorização de imagem — Casa Santa Fé',
  text: `Olá, ${firstName(nome)}! Seu código de confirmação é ${code}. Ele expira em 10 minutos.`,
  html: `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6"><p style="font-size:12px;font-weight:bold;color:#6d28d9;text-transform:uppercase">Casa Santa Fé</p><h1 style="font-size:22px;color:#111827">Confirme sua decisão</h1><p>Olá, ${escapeHtml(firstName(nome))}!</p><p>Use o código abaixo para confirmar sua decisão sobre o uso de imagem:</p><p style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#6d28d9">${escapeHtml(code)}</p><p>O código expira em 10 minutos.</p></div>`,
});

export const buildImageConsentReceiptEmail = ({ nome, authorized, protocol }) => ({
  subject: 'Comprovante de autorização de imagem — Casa Santa Fé',
  text: `Olá, ${firstName(nome)}!\n\nSua decisão foi registrada: ${authorized ? 'AUTORIZO' : 'NÃO AUTORIZO'} o uso institucional da minha imagem.\n\nProtocolo: ${protocol}\nVersão do termo: ${IMAGE_CONSENT_VERSION}\n\nVocê pode alterar essa decisão posteriormente pelos canais da Casa.`,
  html: `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6"><p style="font-size:12px;font-weight:bold;color:#6d28d9;text-transform:uppercase">Casa Santa Fé</p><h1 style="font-size:22px;color:#111827">Comprovante da sua decisão</h1><p>Olá, ${escapeHtml(firstName(nome))}!</p><p>Sua decisão foi registrada: <strong>${authorized ? 'AUTORIZO' : 'NÃO AUTORIZO'} o uso institucional da minha imagem.</strong></p><p>Protocolo: <strong>${escapeHtml(protocol)}</strong><br>Versão do termo: ${IMAGE_CONSENT_VERSION}</p><p style="font-size:12px;color:#6b7280">Você pode alterar essa decisão posteriormente pelos canais da Casa.</p></div>`,
});
