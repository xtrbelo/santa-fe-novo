import { randomUUID } from 'node:crypto';

export const getBookBucketName = projectId => `${projectId}-livro-mediunico`;
export const getBookBucket = (storage, projectId) => storage.bucket(getBookBucketName(projectId));

export const verifyBookStorageAccess = async ({ storage, projectId }) => {
  const bucket = getBookBucket(storage, projectId);
  const file = bucket.file(`diagnostico/${randomUUID()}.txt`);
  try {
    await file.save('storage-ok', { resumable: false, contentType: 'text/plain', metadata: { cacheControl: 'private, no-store' } });
    const [exists] = await file.exists();
    if (!exists) throw new Error('ARQUIVO_TESTE_NAO_ENCONTRADO');
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 60000 });
    if (!String(url || '').startsWith('https://')) throw new Error('URL_ASSINADA_INVALIDA');
    return { ready: true, bucket: bucket.name };
  } finally {
    await file.delete({ ignoreNotFound: true });
  }
};
