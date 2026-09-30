const toDate = value => value?.toDate?.() || (value instanceof Date ? value : new Date(value));
const cleanText = value => String(value || '').trim();

export const validateMemberNotice = data => {
  const titulo = cleanText(data?.titulo);
  const mensagem = cleanText(data?.mensagem);
  const inicioEm = toDate(data?.inicioEm);
  const fimEm = data?.fimEm ? toDate(data.fimEm) : null;
  if (!titulo || titulo.length > 120) throw new Error('TITULO_INVALIDO');
  if (!mensagem || mensagem.length > 1000) throw new Error('MENSAGEM_INVALIDA');
  if (!Number.isFinite(inicioEm?.getTime?.())) throw new Error('INICIO_INVALIDO');
  if (fimEm && (!Number.isFinite(fimEm.getTime()) || fimEm < inicioEm)) throw new Error('FIM_INVALIDO');
  return { titulo, mensagem, inicioEm, fimEm, destaque: data?.destaque === true };
};

export const selectPublishedMemberNotices = (notices, { now = new Date(), limit = 10 } = {}) => (notices || [])
  .map(notice => ({ ...notice, startDate: toDate(notice?.inicioEm), endDate: notice?.fimEm ? toDate(notice.fimEm) : null }))
  .filter(notice => notice.status === 'publicado'
    && Number.isFinite(notice.startDate?.getTime?.())
    && notice.startDate <= now
    && (!notice.endDate || notice.endDate >= now))
  .sort((a, b) => Number(b.destaque === true) - Number(a.destaque === true) || b.startDate - a.startDate)
  .slice(0, limit)
  .map(notice => ({
    id: String(notice.id || ''),
    titulo: cleanText(notice.titulo),
    mensagem: cleanText(notice.mensagem),
    destaque: notice.destaque === true,
    inicioEm: notice.startDate.toISOString(),
    fimEm: notice.endDate?.toISOString?.() || null,
  }))
  .filter(notice => notice.id && notice.titulo && notice.mensagem);
