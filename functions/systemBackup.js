import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';

export const getBackupBucketName = projectId => `${projectId}-backups`;

export const getBackupBucket = (storage, projectId) => storage.bucket(getBackupBucketName(projectId));

const serializeValue = value => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return { __type: 'timestamp', value: value.toDate().toISOString() };
  if (typeof value.path === 'string' && value.firestore) return { __type: 'reference', value: value.path };
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { __type: 'bytes', value: Buffer.from(value).toString('base64') };
  if (Array.isArray(value)) return value.map(serializeValue);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeValue(item)]));
};

export const buildBackupArchive = ({ projectId, createdAt, collections }) => {
  const payload = { schemaVersion: 1, projectId, createdAt, collections: serializeValue(collections) };
  const json = Buffer.from(JSON.stringify(payload));
  const archive = gzipSync(json, { level: 9 });
  return { archive, documentCount: collections.reduce((sum, collection) => sum + collection.documents.length, 0), sha256: createHash('sha256').update(archive).digest('hex') };
};

export const isBackupStatusStale = (lastSuccessAt, now = Date.now(), maximumHours = 36) => {
  const millis = lastSuccessAt?.toMillis?.() || lastSuccessAt?.toDate?.().getTime?.() || new Date(lastSuccessAt || 0).getTime();
  return !Number.isFinite(millis) || millis <= 0 || now - millis > maximumHours * 60 * 60 * 1000;
};
