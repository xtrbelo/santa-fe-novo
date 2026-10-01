import { createSign } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { MEMBER_MEDIA_TYPES, validateMemberMediaUpload } from './memberMedia.js';

const encode = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const clean = value => String(value || '').trim();

export const parseDriveServiceAccount = value => {
  let account;
  try { account = JSON.parse(value); } catch { throw new Error('DRIVE_CREDENCIAL_INVALIDA'); }
  if (!clean(account?.client_email) || !clean(account?.private_key)) throw new Error('DRIVE_CREDENCIAL_INVALIDA');
  return account;
};

export const createDriveAccessToken = async (serviceAccount, now = Date.now()) => {
  const issuedAt = Math.floor(now / 1000);
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const payload = encode({ iss: serviceAccount.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: issuedAt, exp: issuedAt + 3600 });
  const signer = createSign('RSA-SHA256'); signer.update(`${header}.${payload}`); signer.end();
  const assertion = `${header}.${payload}.${signer.sign(serviceAccount.private_key, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  if (!response.ok) throw new Error('DRIVE_AUTENTICACAO_FALHOU');
  const result = await response.json();
  if (!result.access_token) throw new Error('DRIVE_AUTENTICACAO_FALHOU');
  return result.access_token;
};

export const selectDriveInboxFiles = files => (files || []).map(file => ({
  id: clean(file.id), nome: clean(file.name), tipo: clean(file.mimeType).toLowerCase(), tamanho: Number(file.size) || 0,
  criadoEm: clean(file.createdTime), atualizadoEm: clean(file.modifiedTime), miniaturaUrl: clean(file.thumbnailLink),
})).filter(file => file.id && file.nome && MEMBER_MEDIA_TYPES.has(file.tipo) && file.tamanho > 0);

export const listDriveInboxFiles = async ({ accessToken, folderId }) => {
  const params = new URLSearchParams({ q: `'${clean(folderId).replaceAll("'", "\\'")}' in parents and trashed = false`, orderBy: 'createdTime desc', pageSize: '100', fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink)' });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(response.status === 404 ? 'DRIVE_PASTA_NAO_ENCONTRADA' : 'DRIVE_LISTAGEM_FALHOU');
  return selectDriveInboxFiles((await response.json()).files);
};

export const downloadDriveFile = async ({ accessToken, fileId }) => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(clean(fileId))}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error('DRIVE_DOWNLOAD_FALHOU');
  return Buffer.from(await response.arrayBuffer());
};

export const validateDriveImport = ({ albumId, files }) => {
  const selected = (files || []).slice(0, 10).map(file => validateMemberMediaUpload({ albumId, fileName: file.nome, contentType: file.tipo, size: file.tamanho }));
  if (!selected.length || selected.length !== (files || []).length) throw new Error('DRIVE_SELECAO_INVALIDA');
  return selected;
};
