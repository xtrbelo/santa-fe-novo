export const COMMUNICATION_TYPE_LABELS = Object.freeze({ cadastro_aprovado: 'Cadastro aprovado', ativacao_acesso: 'Ativação de acesso', validacao_email: 'Validação de e-mail', recuperacao_senha: 'Recuperação de senha' });
export const COMMUNICATION_STATUS_LABELS = Object.freeze({ enviando: 'Processando', enviado: 'Enviado', erro: 'Falha' });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ERROR_GUIDANCE = Object.freeze({
  ENVIO_NAO_CONCLUIDO: {
    title: 'O provedor não concluiu o envio',
    message: 'Confira o e-mail cadastrado e tente novamente. Se a falha continuar, verifique a configuração do serviço de e-mail.',
  },
  DESTINATARIO_INVALIDO: {
    title: 'E-mail ausente ou inválido',
    message: 'Corrija o e-mail no cadastro da Pessoa antes de solicitar o reenvio.',
  },
});

export const isValidCommunicationEmail = value => EMAIL_PATTERN.test(String(value || '').trim().toLowerCase());

export const getCommunicationDiagnostic = (item, person) => {
  if (item?.status !== 'erro') return null;
  const currentEmail = String(person?.email || '').trim().toLowerCase();
  if (!isValidCommunicationEmail(currentEmail)) return { code: 'DESTINATARIO_INVALIDO', ...ERROR_GUIDANCE.DESTINATARIO_INVALIDO, canResend: false };
  if (!person || person.ativo === false) return { code: 'PESSOA_INDISPONIVEL', title: 'Cadastro indisponível', message: 'Ative ou restaure o cadastro da Pessoa antes de solicitar o reenvio.', canResend: false };
  const guidance = ERROR_GUIDANCE[item.erro] || { title: 'Falha não identificada', message: 'Tente novamente. Se a falha continuar, solicite a verificação do serviço de e-mail.' };
  return { code: item.erro || 'ERRO_DESCONHECIDO', ...guidance, canResend: true, destinationChanged: currentEmail !== String(item.destinatario || '').trim().toLowerCase(), currentEmail };
};

export const summarizeCommunications = items => items.reduce((summary, item) => {
  const status = Object.hasOwn(summary, item.status) ? item.status : 'outros';
  summary[status] += 1;
  return summary;
}, { enviado: 0, enviando: 0, erro: 0, outros: 0 });

export const buildCommunicationWhatsappUrl = person => {
  const phone = String(person?.contato || '').replace(/\D/g, '');
  if (phone.length < 10) return null;
  const destination = phone.startsWith('55') ? phone : `55${phone}`;
  const message = `Olá, ${person?.nome || 'tudo bem'}! A Casa Santa Fé está entrando em contato sobre seu cadastro.`;
  return `https://wa.me/${destination}?text=${encodeURIComponent(message)}`;
};
