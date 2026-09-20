const escapeHtml = value => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const template = ({ title, greeting = 'Olá', description, actionLabel, actionUrl }) => ({
  subject: `${title} — Casa Santa Fé`,
  text: `${greeting}!\n\n${description}\n\n${actionLabel}: ${actionUrl}\n\nSe você não solicitou esta ação, ignore este e-mail.`,
  html: `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6"><p style="font-size:12px;font-weight:bold;color:#6d28d9;text-transform:uppercase">Casa Santa Fé</p><h1 style="font-size:22px;color:#111827">${escapeHtml(title)}</h1><p>${escapeHtml(greeting)}!</p><p>${escapeHtml(description)}</p><p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#6d28d9;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">${escapeHtml(actionLabel)}</a></p><p style="font-size:12px;color:#6b7280">Se você não solicitou esta ação, ignore este e-mail.</p></div>`,
});

export const buildActivationEmail = ({ nome, link }) => template({ title: 'Ative seu acesso', greeting: `Olá, ${String(nome || '').trim().split(/\s+/)[0] || 'membro'}`, description: 'Seu acesso ao Sistema Santa Fé foi autorizado. Use o botão abaixo para confirmar seu e-mail e criar sua senha pessoal.', actionLabel: 'Ativar meu acesso', actionUrl: link });
export const buildVerificationEmail = ({ nome, link }) => template({ title: 'Confirme seu e-mail', greeting: `Olá, ${String(nome || '').trim().split(/\s+/)[0] || 'membro'}`, description: 'Confirme seu endereço de e-mail para continuar usando o Sistema Santa Fé.', actionLabel: 'Confirmar e-mail', actionUrl: link });
export const buildPasswordResetEmail = ({ nome, link }) => template({ title: 'Redefina sua senha', greeting: `Olá, ${String(nome || '').trim().split(/\s+/)[0] || 'membro'}`, description: 'Recebemos uma solicitação para redefinir sua senha do Sistema Santa Fé.', actionLabel: 'Criar nova senha', actionUrl: link });

export const getSystemBaseUrl = projectId => projectId === 'santa-fe-v2-prod' ? 'https://caesf.com.br' : 'https://santa-fe-v2-hml.web.app';
