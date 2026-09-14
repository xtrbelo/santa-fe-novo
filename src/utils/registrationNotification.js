const digits = value => String(value || '').replace(/\D/g, '');

export const getRegistrationNotification = request => {
  const approved = request?.statusCadastro === 'aprovado';
  const rejected = request?.statusCadastro === 'rejeitado';
  if (!approved && !rejected) return null;
  const firstName = String(request.nome || '').trim().split(/\s+/)[0] || 'Olá';
  const result = approved ? 'aprovado' : 'rejeitado';
  const reason = rejected && request.motivoRejeicao ? ` Motivo: ${request.motivoRejeicao}.` : '';
  const message = `${firstName}, seu cadastro na Casa Santa Fé foi ${result}.${reason}`;
  const phone = digits(request.contato);
  const whatsappPhone = phone.length === 10 || phone.length === 11 ? `55${phone}` : phone;
  return {
    message,
    whatsappUrl: whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}` : null,
    emailUrl: request.email ? `mailto:${encodeURIComponent(request.email)}?subject=${encodeURIComponent('Resultado do cadastro — Casa Santa Fé')}&body=${encodeURIComponent(message)}` : null,
  };
};
