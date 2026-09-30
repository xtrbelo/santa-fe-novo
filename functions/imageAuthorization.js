const cleanText = value => String(value || '').trim();
const isoDate = value => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};

export const IMAGE_AUTHORIZATION_STATUSES = Object.freeze(['pendente', 'autorizado', 'nao_autorizado']);

export const selectImageAuthorizations = (people, authorizations = []) => {
  const byPerson = new Map((authorizations || []).map(item => [cleanText(item?.id), item]));
  return (people || [])
    .filter(person => person?.ativo !== false && (person?.vinculo === 'membro' || person?.tipoPessoa === 'Membro'))
    .map(person => {
      const authorization = byPerson.get(cleanText(person?.id));
      const consent = person?.consentimentoImagem;
      const trustedAuthorization = ['titular_email', 'titular_sistema'].includes(authorization?.origem);
      const trustedConsent = consent && consent?.origem !== 'titular_presencial';
      const status = trustedAuthorization && IMAGE_AUTHORIZATION_STATUSES.includes(authorization?.status)
        ? authorization.status
        : trustedConsent && consent?.autorizado === true ? 'autorizado' : trustedConsent && consent?.autorizado === false ? 'nao_autorizado' : 'pendente';
      return {
        pessoaId: cleanText(person?.id),
        nome: cleanText(person?.nome),
        status,
        observacao: trustedAuthorization ? cleanText(authorization?.observacao) || null : null,
        atualizadoEm: isoDate((trustedAuthorization && authorization?.atualizadoEm) || (trustedConsent && consent?.registradoEm)),
        responsavelNome: trustedAuthorization ? cleanText(authorization?.responsavelNome) || null : trustedConsent ? 'Aceite no cadastro' : null,
        origem: trustedAuthorization ? authorization.origem : trustedConsent ? 'cadastro' : 'pendente',
        versaoTermo: cleanText((trustedAuthorization && authorization?.versaoTermo) || (trustedConsent && consent?.versao)) || null,
        temEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanText(person?.email)),
      };
    })
    .filter(item => item.pessoaId && item.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};

export const findUnauthorizedParticipants = (participantIds, authorizationItems) => {
  const byPerson = new Map((authorizationItems || []).map(item => [item.pessoaId, item]));
  return [...new Set((participantIds || []).map(cleanText).filter(Boolean))]
    .map(id => byPerson.get(id) || { pessoaId: id, nome: 'Membro não localizado', status: 'pendente' })
    .filter(item => item.status !== 'autorizado');
};
