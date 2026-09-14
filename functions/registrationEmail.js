import { Buffer } from 'node:buffer';

const escapeHtml = value => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const buildApprovedRegistrationEmail = registration => {
  const firstName = String(registration?.nome || '').trim().split(/\s+/)[0] || 'Olá';
  const greeting = escapeHtml(firstName);
  return {
    subject: 'Cadastro aprovado — Casa Santa Fé',
    text: `Olá, ${firstName}!\n\nSeu cadastro de membro na Casa Santa Fé foi aprovado.\n\nEsta é uma comunicação automática. Em caso de dúvida, responda a este e-mail para falar com a Casa Santa Fé.`,
    html: `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6"><p style="font-size:12px;font-weight:bold;color:#6d28d9;text-transform:uppercase">Casa Santa Fé</p><h1 style="font-size:22px;color:#111827">Cadastro aprovado</h1><p>Olá, <strong>${greeting}</strong>!</p><p>Seu cadastro de membro na Casa Santa Fé foi aprovado.</p><p style="font-size:13px;color:#6b7280">Esta é uma comunicação automática. Em caso de dúvida, responda a este e-mail para falar com a Casa Santa Fé.</p></div>`,
  };
};

export const shouldSendApprovedRegistrationEmail = ({ before, after }) =>
  before?.statusCadastro !== 'aprovado'
  && after?.statusCadastro === 'aprovado'
  && after?.tipoCadastro !== 'consulente'
  && Boolean(String(after?.email || '').trim());

export const sendMailjetEmail = async ({ apiKey, secretKey, fromEmail, registration, fetchImpl = fetch }) => {
  if (!apiKey || !secretKey || !fromEmail) throw new Error('MAILJET_CONFIGURACAO_INCOMPLETA');
  const message = buildApprovedRegistrationEmail(registration);
  const response = await fetchImpl('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Messages: [{
        From: { Email: fromEmail, Name: 'Casa Santa Fé' },
        ReplyTo: { Email: fromEmail, Name: 'Casa Santa Fé' },
        To: [{ Email: String(registration.email).trim(), Name: String(registration.nome || '').trim() }],
        Subject: message.subject,
        TextPart: message.text,
        HTMLPart: message.html,
      }],
    }),
  });
  if (!response.ok) throw new Error(`MAILJET_ENVIO_FALHOU_${response.status}`);
  return response.json();
};

export const sendMailjetMessage = async ({ apiKey, secretKey, fromEmail, toEmail, toName, subject, text, html, fetchImpl = fetch }) => {
  if (!apiKey || !secretKey || !fromEmail) throw new Error('MAILJET_CONFIGURACAO_INCOMPLETA');
  const response = await fetchImpl('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Messages: [{ From: { Email: fromEmail, Name: 'Casa Santa Fé' }, ReplyTo: { Email: fromEmail, Name: 'Casa Santa Fé' }, To: [{ Email: toEmail, Name: toName || '' }], Subject: subject, TextPart: text, HTMLPart: html }] }),
  });
  if (!response.ok) throw new Error(`MAILJET_ENVIO_FALHOU_${response.status}`);
  return response.json();
};
