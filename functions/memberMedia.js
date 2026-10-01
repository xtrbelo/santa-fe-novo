import { randomUUID } from 'node:crypto';

export const MEMBER_MEDIA_LIMIT = 30;
export const MEMBER_MEDIA_INBOX_LIMIT = 200;
export const MEMBER_MEDIA_IMAGE_LIMIT = 10 * 1024 * 1024;
export const MEMBER_MEDIA_VIDEO_LIMIT = 200 * 1024 * 1024;
export const MEMBER_MEDIA_RECOVERY_DAYS = 30;
export const MEMBER_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']);

const cleanText = value => String(value || '').trim();
const cleanEtag = value => cleanText(value).replace(/^"|"$/g, '').toLowerCase();
const slugify = value => cleanText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export const buildInstitutionalMediaName = ({ album, originalName, contentType, sequence }) => {
  const extension = contentType === 'image/jpeg' ? 'jpg' : cleanText(contentType).split('/')[1] || cleanText(originalName).split('.').pop().toLowerCase() || 'bin';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(album?.dataAtividade || '') ? album.dataAtividade : 'sem-data';
  const category = slugify(album?.categoria) || 'registro';
  const title = slugify(album?.titulo) || 'album';
  const order = String(Math.max(1, Number(sequence) || 1)).padStart(3, '0');
  return `${date}_${category}_${title}_${order}.${extension}`;
};

export const buildMediaStorageReport = files => {
  const active = (files || []).filter(file => file?.objectKey && file?.status !== 'removido');
  const uniqueObjects = new Map();
  active.forEach(file => { if (!uniqueObjects.has(file.objectKey)) uniqueObjects.set(file.objectKey, Math.max(0, Number(file.tamanho) || 0)); });
  const groups = new Map();
  active.forEach(file => {
    const etag = cleanEtag(file.etag);
    const signature = etag ? `etag:${etag}` : `legacy:${cleanText(file.nome).toLocaleLowerCase('pt-BR')}:${Math.max(0, Number(file.tamanho) || 0)}`;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(file);
  });
  const duplicateByKey = new Map(); let duplicateFiles = 0; let possibleSavingsBytes = 0;
  groups.forEach(group => {
    const objectKeys = [...new Set(group.map(file => file.objectKey))];
    if (objectKeys.length < 2) return;
    const confirmed = Boolean(cleanEtag(group[0]?.etag));
    duplicateFiles += objectKeys.length - 1;
    possibleSavingsBytes += (objectKeys.length - 1) * Math.max(0, Number(group[0]?.tamanho) || 0);
    group.forEach(file => duplicateByKey.set(file.objectKey, { duplicadoPossivel: true, duplicidade: confirmed ? 'confirmada' : 'possivel', copias: objectKeys.length }));
  });
  return {
    totalBytes: [...uniqueObjects.values()].reduce((sum, size) => sum + size, 0),
    totalArquivos: uniqueObjects.size,
    duplicados: duplicateFiles,
    economiaPossivelBytes: possibleSavingsBytes,
    duplicateByKey,
  };
};

export const getArchivedMediaRecovery = (archivedAt, { now = new Date(), recoveryDays = MEMBER_MEDIA_RECOVERY_DAYS } = {}) => {
  const archivedDate = archivedAt?.toDate?.() || new Date(archivedAt || 0);
  const archivedTime = archivedDate.getTime();
  if (!Number.isFinite(archivedTime) || archivedTime <= 0) return { recuperavel: false, arquivadoEm: null, recuperarAte: null };
  const recoveryDate = new Date(archivedTime + recoveryDays * 24 * 60 * 60 * 1000);
  return { recuperavel: now.getTime() <= recoveryDate.getTime(), arquivadoEm: archivedDate.toISOString(), recuperarAte: recoveryDate.toISOString() };
};

export const validateMemberMediaUpload = data => {
  const albumId = cleanText(data?.albumId);
  const fileName = cleanText(data?.fileName).slice(0, 180);
  const contentType = cleanText(data?.contentType).toLowerCase();
  const size = Number(data?.size);
  if (!albumId || albumId.length > 160 || !fileName) throw new Error('ARQUIVO_INVALIDO');
  if (!MEMBER_MEDIA_TYPES.has(contentType) || !Number.isInteger(size) || size <= 0) throw new Error('TIPO_ARQUIVO_INVALIDO');
  const limit = contentType.startsWith('image/') ? MEMBER_MEDIA_IMAGE_LIMIT : MEMBER_MEDIA_VIDEO_LIMIT;
  if (size > limit) throw new Error(contentType.startsWith('image/') ? 'IMAGEM_MUITO_GRANDE' : 'VIDEO_MUITO_GRANDE');
  const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
  return { albumId, fileName, contentType, size, objectKey: `member-albums/${albumId}/${randomUUID()}.${extension}` };
};

export const validateMemberInboxUpload = data => {
  const fileName = cleanText(data?.fileName).slice(0, 180);
  const contentType = cleanText(data?.contentType).toLowerCase();
  const size = Number(data?.size);
  if (!fileName) throw new Error('ARQUIVO_INVALIDO');
  if (!MEMBER_MEDIA_TYPES.has(contentType) || !Number.isInteger(size) || size <= 0) throw new Error('TIPO_ARQUIVO_INVALIDO');
  const limit = contentType.startsWith('image/') ? MEMBER_MEDIA_IMAGE_LIMIT : MEMBER_MEDIA_VIDEO_LIMIT;
  if (size > limit) throw new Error(contentType.startsWith('image/') ? 'IMAGEM_MUITO_GRANDE' : 'VIDEO_MUITO_GRANDE');
  const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
  return { fileName, contentType, size, extension };
};

export const selectMemberMedia = files => (files || [])
  .filter(file => file?.status === 'disponivel')
  .map((file, index) => ({ id: cleanText(file.id), nome: cleanText(file.nome), nomeOriginal: cleanText(file.nomeOriginal), legenda: cleanText(file.legenda), descricaoAlternativa: cleanText(file.descricaoAlternativa), tipo: cleanText(file.tipo), tamanho: Number(file.tamanho) || 0, ordem: Number.isInteger(file.ordem) ? file.ordem : Number.MAX_SAFE_INTEGER, indiceOriginal: index }))
  .filter(file => file.id && MEMBER_MEDIA_TYPES.has(file.tipo))
  .sort((a, b) => a.ordem - b.ordem || a.indiceOriginal - b.indiceOriginal)
  .map(file => ({ id: file.id, nome: file.nome, nomeOriginal: file.nomeOriginal, legenda: file.legenda, descricaoAlternativa: file.descricaoAlternativa, tipo: file.tipo, tamanho: file.tamanho }));
