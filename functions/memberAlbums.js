const cleanText = value => String(value || '').trim();
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isValidDay = value => {
  if (!DAY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};

export const validateMemberAlbum = data => {
  const titulo = cleanText(data?.titulo);
  const atividade = cleanText(data?.atividade);
  const descricao = cleanText(data?.descricao);
  const dataAtividade = cleanText(data?.dataAtividade);
  const status = cleanText(data?.status || 'rascunho');
  const participantesIds = [...new Set((data?.participantesIds || []).map(cleanText).filter(Boolean))];
  const revisaoAutorizacoesConfirmada = data?.revisaoAutorizacoesConfirmada === true;
  if (!titulo || titulo.length > 120) throw new Error('TITULO_INVALIDO');
  if (atividade.length > 120) throw new Error('ATIVIDADE_INVALIDA');
  if (descricao.length > 600) throw new Error('DESCRICAO_INVALIDA');
  if (!isValidDay(dataAtividade)) throw new Error('DATA_ATIVIDADE_INVALIDA');
  if (!['rascunho', 'publicado'].includes(status)) throw new Error('STATUS_INVALIDO');
  if (participantesIds.length > 100 || participantesIds.some(id => id.length > 160)) throw new Error('PARTICIPANTES_INVALIDOS');
  if (status === 'publicado' && !revisaoAutorizacoesConfirmada) throw new Error('REVISAO_AUTORIZACOES_OBRIGATORIA');
  return { titulo, atividade, descricao, dataAtividade, status, participantesIds, revisaoAutorizacoesConfirmada };
};

export const selectMemberAlbums = (albums, { includeDrafts = false, limit = 30 } = {}) => (albums || [])
  .filter(album => album?.status !== 'arquivado' && (includeDrafts || album?.status === 'publicado'))
  .map(album => ({
    id: cleanText(album?.id),
    titulo: cleanText(album?.titulo),
    atividade: cleanText(album?.atividade),
    descricao: cleanText(album?.descricao),
    dataAtividade: cleanText(album?.dataAtividade),
    status: cleanText(album?.status),
    quantidadeArquivos: Math.max(0, Number(album?.quantidadeArquivos) || 0),
    participantesIds: [...new Set((album?.participantesIds || []).map(cleanText).filter(Boolean))],
    revisaoAutorizacoesConfirmada: album?.revisaoAutorizacoesConfirmada === true,
  }))
  .filter(album => album.id && album.titulo && isValidDay(album.dataAtividade))
  .sort((a, b) => b.dataAtividade.localeCompare(a.dataAtividade) || a.titulo.localeCompare(b.titulo, 'pt-BR'))
  .slice(0, limit);
