export const REGISTRATION_LINK_TYPES = Object.freeze({ MEMBER: 'membro', CONSULTEE: 'consulente' });

export const REGISTRATION_LINK_TYPE_LABELS = Object.freeze({
  [REGISTRATION_LINK_TYPES.MEMBER]: 'Membro — cadastro completo',
  [REGISTRATION_LINK_TYPES.CONSULTEE]: 'Consulente — cadastro simplificado',
});

export const buildRegistrationLinkUrl = (linkId, origin = globalThis.location?.origin) => {
  if (!/^[a-f0-9]{64}$/.test(String(linkId || ''))) throw new Error('LINK_CADASTRO_INVALIDO');
  return `${String(origin).replace(/\/$/, '')}/autocadastro?link=${encodeURIComponent(linkId)}`;
};

export const getRegistrationLinkEffectiveStatus = (link, now = Date.now()) => {
  if (link?.status !== 'ativo') return 'inativo';
  if (link.expiraEm?.toMillis?.() <= now) return 'expirado';
  if (Number.isInteger(link.limiteUsos) && link.limiteUsos > 0 && Number(link.totalUsos || 0) >= link.limiteUsos) return 'esgotado';
  return 'ativo';
};

export const getRegistrationLinkWarnings = (link, now = Date.now()) => {
  const warnings = [];
  const status = getRegistrationLinkEffectiveStatus(link, now);
  if (status === 'expirado') warnings.push({ type: 'expired', message: 'Link expirado. Renove a validade para voltar a receber cadastros.' });
  else if (status === 'esgotado') warnings.push({ type: 'limit', message: 'Limite de usos atingido. Aumente o limite para reabrir o link.' });
  else if (status === 'ativo') {
    const remainingMs = link?.expiraEm?.toMillis?.() - now;
    if (Number.isFinite(remainingMs) && remainingMs > 0 && remainingMs <= 7 * 86400000) {
      const days = Math.max(1, Math.ceil(remainingMs / 86400000));
      warnings.push({ type: 'expiry-soon', message: `Este link expira em ${days} ${days === 1 ? 'dia' : 'dias'}.` });
    }
    if (Number.isInteger(link?.limiteUsos) && link.limiteUsos > 0) {
      const remaining = link.limiteUsos - Number(link.totalUsos || 0);
      if (remaining > 0 && Number(link.totalUsos || 0) / link.limiteUsos >= 0.8) warnings.push({ type: 'limit-soon', message: `Restam ${remaining} ${remaining === 1 ? 'uso' : 'usos'} antes do limite.` });
    }
  }
  return warnings;
};

export const normalizeRegistrationLinkConfig = data => {
  const tipoCadastro = String(data?.tipoCadastro || '');
  const nome = String(data?.nome || '').trim();
  const validadeDias = data?.validadeDias === '' ? null : Number(data?.validadeDias);
  const limiteUsos = data?.limiteUsos === '' ? null : Number(data?.limiteUsos);
  if (!Object.values(REGISTRATION_LINK_TYPES).includes(tipoCadastro)) throw new Error('TIPO_LINK_INVALIDO');
  if (!nome || nome.length > 100) throw new Error('NOME_LINK_INVALIDO');
  if (validadeDias !== null && (!Number.isInteger(validadeDias) || validadeDias < 1 || validadeDias > 365)) throw new Error('VALIDADE_LINK_INVALIDA');
  if (limiteUsos !== null && (!Number.isInteger(limiteUsos) || limiteUsos < 1 || limiteUsos > 10000)) throw new Error('LIMITE_LINK_INVALIDO');
  return { tipoCadastro, nome, validadeDias, limiteUsos };
};

export const normalizeRegistrationLinkEdit = (data, totalUsos = 0) => {
  const nome = String(data?.nome || '').trim();
  const validadeDias = data?.validadeDias === '' ? null : Number(data?.validadeDias);
  const limiteUsos = data?.limiteUsos === '' ? null : Number(data?.limiteUsos);
  if (!nome || nome.length > 100) throw new Error('NOME_LINK_INVALIDO');
  if (validadeDias !== null && (!Number.isInteger(validadeDias) || validadeDias < 1 || validadeDias > 365)) throw new Error('VALIDADE_LINK_INVALIDA');
  if (limiteUsos !== null && (!Number.isInteger(limiteUsos) || limiteUsos < 1 || limiteUsos > 10000)) throw new Error('LIMITE_LINK_INVALIDO');
  if (limiteUsos !== null && limiteUsos < Number(totalUsos || 0)) throw new Error('LIMITE_INFERIOR_AOS_USOS');
  return { nome, validadeDias, limiteUsos };
};
