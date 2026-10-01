import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { DeleteObjectCommand, HeadObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import process from 'node:process';
import { assertAdminContinuity, isActiveAdmin, requiresActiveMember, requiresAdminCount, resolveProjectId, validateAccessAuthorizationCreation, validateUserPersonLinkChange } from './adminPolicy.js';
import { buildApprovedRegistrationEmail, sendMailjetEmail, sendMailjetMessage, shouldSendApprovedRegistrationEmail } from './registrationEmail.js';
import { buildActivationEmail, buildPasswordResetEmail, buildVerificationEmail, getSystemBaseUrl } from './accountEmail.js';
import { buildRegistrationEvidenceHash, buildRegistrationVerificationEmail, createVerificationCode, hashVerificationCode, hashVerificationIdentity, isVerificationEmail, normalizeVerificationEmail, verificationCodeMatches } from './registrationVerification.js';
import { assertMemberEmailAvailable, getActiveMemberEmailIndexId, getMemberEmailIndexId, isActiveMemberIdentity, validateSecurePersonPayload } from './personIdentity.js';
import { normalizeWorkerIds, validateAttendanceWorkers, validateDayCanClose } from './attendanceWorkers.js';
import { getScheduledWorkerIds } from './workGroups.js';
import { buildBookVolumeHash, verifyBookVolumeHash } from './bookVolume.js';
import { buildBookAttendances } from './bookRecord.js';
import { getBookCompetence, isPreviousOpenBookVolume } from './bookSchedule.js';
import { buildPublicBookAuthenticity } from './bookAuthenticity.js';
import { getBookBucket, verifyBookStorageAccess } from './bookStorage.js';
import { buildBookSignatureEvidence, buildBookSignerIdentityHash } from './bookSignature.js';
import { hasEmbeddedPdfDigitalSignature } from './pdfDigitalSignature.js';
import { canResetArchivedBookInHml } from './hmlBookReset.js';
import { isValidCpf, normalizeCpf } from './cpfValidation.js';
import { buildBackupArchive, getBackupBucket } from './systemBackup.js';
import { buildSecureRegistrationPayload, hashPublicIdentity, isRateLimitExceeded } from './publicRegistration.js';
import { validateDataExportRequest } from './dataExportPolicy.js';
import { getOrphanAccessIndexReason } from './accessIndexCleanup.js';
import { selectMemberBirthdays, selectMemberCalendar, startOfSaoPauloDay } from './memberArea.js';
import { selectPublishedMemberNotices, validateMemberNotice } from './memberNotices.js';
import { selectMemberAlbums, selectRecoverableMemberAlbums, validateMemberAlbum } from './memberAlbums.js';
import { MEMBER_MEDIA_INBOX_LIMIT, MEMBER_MEDIA_LIMIT, buildInstitutionalMediaName, buildMediaStorageReport, getArchivedMediaRecovery, selectMemberMedia, validateMemberInboxUpload, validateMemberMediaUpload } from './memberMedia.js';
import { selectImageAuthorizations } from './imageAuthorization.js';
import { createDriveAccessToken, downloadDriveFile, listDriveInboxFiles, parseDriveServiceAccount, validateDriveImport } from './googleDriveInbox.js';
import { IMAGE_CONSENT_REQUEST_TTL_MS, IMAGE_CONSENT_VERSION, buildImageConsentCodeEmail, buildImageConsentEvidenceHash, buildImageConsentInvitationEmail, buildImageConsentReceiptEmail, createImageConsentToken, hashImageConsentToken, maskImageConsentEmail } from './imageConsentInvitation.js';
import { buildCollectionPatch, CASE_NORMALIZATION_COLLECTIONS, normalizeCollectionData, normalizeDisplayText } from './textCase.js';

if (!getApps().length) initializeApp();

const accessRoles = new Set(['admin', 'gestor', 'atendimento', 'membro', 'midia']);
const internalRoles = new Set(['admin', 'gestor', 'atendimento']);
const memberAreaRoles = new Set(['admin', 'gestor', 'atendimento', 'membro', 'midia']);
const memberMediaRoles = new Set(['admin', 'gestor', 'midia']);
const fail = (code, message) => { throw new HttpsError(code, message); };
const normalizeIdentityEmail = value => String(value || '').trim().toLowerCase();
const normalizeWorkName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const isActiveMemberRecord = person => person?.ativo !== false && String(person?.vinculo || person?.tipoPessoa || '').trim().toLowerCase() === 'membro';
const PERSON_EDITABLE_FIELDS = new Set(['vinculo', 'funcoesCasa', 'tipoPessoa', 'nome', 'dataNascimento', 'ocultarAniversario', 'cpf', 'contato', 'email', 'responsavelCpf', 'responsavelNome', 'responsavelContato', 'sexo', 'estadoCivil', 'endereco', 'dadosCasa', 'statusCadastro', 'origemCadastro', 'busca']);
const cleanPersonPayload = data => Object.fromEntries(Object.entries(data || {}).filter(([key, value]) => PERSON_EDITABLE_FIELDS.has(key) && value !== undefined));
const mailjetApiKey = defineSecret('MAILJET_API_KEY');
const mailjetSecretKey = defineSecret('MAILJET_SECRET_KEY');
const registrationEmailFrom = defineSecret('REGISTRATION_EMAIL_FROM');
const r2AccountId = defineSecret('R2_ACCOUNT_ID');
const r2BucketName = defineSecret('R2_BUCKET_NAME');
const r2AccessKeyId = defineSecret('R2_ACCESS_KEY_ID');
const r2SecretAccessKey = defineSecret('R2_SECRET_ACCESS_KEY');
const r2Secrets = [r2AccountId, r2BucketName, r2AccessKeyId, r2SecretAccessKey];
const googleDriveServiceAccount = defineSecret('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON');
const googleDriveInboxFolderId = defineSecret('GOOGLE_DRIVE_INBOX_FOLDER_ID');
const driveInboxSecrets = [...r2Secrets, googleDriveServiceAccount, googleDriveInboxFolderId];
const getR2Client = () => new S3Client({
  region: 'auto',
  endpoint: `https://${r2AccountId.value()}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: r2AccessKeyId.value(), secretAccessKey: r2SecretAccessKey.value() },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
const AUDIT_RETENTION_MONTHS = 24;
const monthKey = value => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(value?.toDate?.() || new Date(value));
  return `${parts.find(item => item.type === 'year')?.value}-${parts.find(item => item.type === 'month')?.value}`;
};
const bookRecordsFromSnapshot = snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data(), dataAtendimento: item.data().dataAtendimento?.toDate?.()?.toISOString?.() || null }));

const closePreviousBookVolumes = async () => {
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const currentCompetence = getBookCompetence(new Date());
  const volumesSnapshot = await root.collection('livro_mediunico_volumes').where('status', '==', 'aberto').get();
  const dueVolumes = volumesSnapshot.docs.filter(item => isPreviousOpenBookVolume(item.data(), currentCompetence));
  let closed = 0; let failed = 0;
  for (const volume of dueVolumes) {
    try {
      const recordsSnapshot = await root.collection('livro_mediunico_registros').where('volumeId', '==', volume.id).get();
      if (recordsSnapshot.empty) throw new Error('VOLUME_SEM_REGISTROS');
      const records = bookRecordsFromSnapshot(recordsSnapshot); const integrityHash = buildBookVolumeHash({ numero: volume.data().numero, records });
      const dates = records.map(item => item.dataAtendimento).filter(Boolean).sort(); const now = FieldValue.serverTimestamp(); const batch = firestore.batch();
      batch.update(volume.ref, { status: 'encerrado', encerradoAutomaticamente: true, encerradoEm: now, encerradoPor: 'sistema', periodoInicio: dates[0] || null, periodoFim: dates.at(-1) || null, quantidadeRegistros: records.length, quantidadeAtendimentos: records.reduce((sum, item) => sum + Number(item.quantidadeAtendimentos || 0), 0), hashIntegridade: integrityHash, codigoVerificacao: integrityHash.slice(0, 12).toUpperCase(), fechamentoAutomaticoErro: FieldValue.delete(), atualizadoEm: now });
      batch.set(root.collection('auditoria').doc(), { tipo: 'LIVRO_VOLUME_MENSAL_ENCERRADO_AUTOMATICAMENTE', alvoId: volume.id, volumeId: volume.id, volumeNumero: volume.data().numero, competencia: volume.data().competencia, codigoVerificacao: integrityHash.slice(0, 12).toUpperCase(), executadoPor: 'sistema', criadoEm: now });
      await batch.commit(); closed += 1;
    } catch (error) {
      const now = FieldValue.serverTimestamp(); const reason = String(error?.message || 'ERRO_DESCONHECIDO').slice(0, 200); const batch = firestore.batch();
      batch.update(volume.ref, { fechamentoAutomaticoErro: { codigo: reason, ocorridoEm: now }, atualizadoEm: now });
      batch.set(root.collection('auditoria').doc(), { tipo: 'LIVRO_VOLUME_FECHAMENTO_AUTOMATICO_FALHOU', alvoId: volume.id, volumeId: volume.id, volumeNumero: volume.data().numero, competencia: volume.data().competencia, motivo: reason, executadoPor: 'sistema', criadoEm: now });
      await batch.commit(); failed += 1;
    }
  }
  return { checked: dueVolumes.length, closed, failed };
};

export const closeMonthlyBookVolumes = onSchedule({ schedule: '0 6 1 * *', timeZone: 'America/Sao_Paulo', region: 'us-central1', retryCount: 3 }, closePreviousBookVolumes);

const captureBackupCollections = async root => {
  const collections = await root.listCollections();
  return Promise.all(collections.map(async collection => {
    const snapshot = await collection.get();
    return { path: collection.path, documents: snapshot.docs.map(document => ({ id: document.id, data: document.data() })) };
  }));
};

const executeSystemBackup = async ({ trigger = 'automatico', requestedBy = 'sistema' } = {}) => {
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const statusRef = root.collection('sistema_operacional').doc('backup'); const startedAt = new Date();
  await statusRef.set({ status: 'executando', inicioEm: FieldValue.serverTimestamp(), tipoExecucao: trigger, solicitadoPor: requestedBy }, { merge: true });
  try {
    const collections = await captureBackupCollections(root);
    const createdAt = startedAt.toISOString(); const result = buildBackupArchive({ projectId, createdAt, collections });
    const path = `backups/${projectId}/${createdAt.slice(0, 10)}/backup-${createdAt.replace(/[:.]/g, '-')}.json.gz`;
    const bucket = getBackupBucket(getStorage(), projectId);
    await bucket.file(path).save(result.archive, { resumable: false, contentType: 'application/gzip', metadata: { cacheControl: 'private, no-store', metadata: { sha256: result.sha256, projectId } } });
    const completedAt = FieldValue.serverTimestamp();
    await statusRef.set({ status: 'sucesso', ultimoSucessoEm: completedAt, ultimaExecucaoEm: completedAt, tipoExecucao: trigger, solicitadoPor: requestedBy, arquivo: { caminho: path, tamanho: result.archive.length, hashSha256: result.sha256 }, quantidadeColecoes: collections.length, quantidadeDocumentos: result.documentCount, erro: FieldValue.delete() }, { merge: true });
    await root.collection('auditoria').add({ tipo: 'BACKUP_SISTEMA_CONCLUIDO', alvoId: 'backup', tipoExecucao: trigger, quantidadeColecoes: collections.length, quantidadeDocumentos: result.documentCount, hashArquivo: result.sha256, executadoPor: requestedBy, criadoEm: completedAt });
    const [files] = await bucket.getFiles({ prefix: `backups/${projectId}/` }); const cutoff = Date.now() - 35 * 24 * 60 * 60 * 1000;
    await Promise.all(files.filter(file => new Date(file.metadata?.timeCreated || 0).getTime() < cutoff).map(file => file.delete().catch(() => undefined)));
    return { path, collections: collections.length, documents: result.documentCount, sha256: result.sha256 };
  } catch (error) {
    const reason = String(error?.message || 'ERRO_DESCONHECIDO').slice(0, 300); const failedAt = FieldValue.serverTimestamp();
    await statusRef.set({ status: 'erro', ultimaExecucaoEm: failedAt, tipoExecucao: trigger, solicitadoPor: requestedBy, erro: { codigo: reason, ocorridoEm: failedAt } }, { merge: true });
    await root.collection('auditoria').add({ tipo: 'BACKUP_SISTEMA_FALHOU', alvoId: 'backup', tipoExecucao: trigger, motivo: reason, executadoPor: requestedBy, criadoEm: failedAt });
    throw error;
  }
};

export const runDailySystemBackup = onSchedule({ schedule: '0 3 * * *', timeZone: 'America/Sao_Paulo', region: 'us-central1', retryCount: 3, timeoutSeconds: 540, memory: '1GiB' }, () => executeSystemBackup());

export const runSystemBackup = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const root = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data'); const executor = await root.collection('usuarios').doc(request.auth.uid).get();
  if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
  return executeSystemBackup({ trigger: 'manual', requestedBy: request.auth.uid });
});

export const normalizeExistingTextRecords = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const mode = request.data?.mode === 'apply' ? 'apply' : 'preview';
  if (mode === 'apply' && request.data?.confirmation !== 'NORMALIZAR_REGISTROS_EXISTENTES') fail('failed-precondition', 'CONFIRMACAO_OBRIGATORIA');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const executor = await root.collection('usuarios').doc(request.auth.uid).get();
  if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');

  const report = { mode, analyzed: 0, changed: 0, fields: 0, collections: {} };
  const writer = mode === 'apply' ? firestore.bulkWriter() : null;
  for (const collectionName of CASE_NORMALIZATION_COLLECTIONS) {
    const snapshot = await root.collection(collectionName).get();
    let analyzed = 0; let changed = 0; let fields = 0;
    for (const item of snapshot.docs) {
      analyzed += 1;
      const patch = buildCollectionPatch(collectionName, item.data());
      const keys = Object.keys(patch);
      if (!keys.length) continue;
      changed += 1; fields += keys.length;
      if (writer) writer.update(item.ref, patch);
    }
    report.analyzed += analyzed; report.changed += changed; report.fields += fields;
    report.collections[collectionName] = { analyzed, changed, fields };
  }
  if (writer) {
    await writer.close();
    await root.collection('auditoria').add({ tipo: 'PADRONIZACAO_TEXTO_APLICADA', colecoes: report.collections, quantidadeAnalisada: report.analyzed, quantidadeAtualizada: report.changed, quantidadeCampos: report.fields, executadoPor: request.auth.uid, criadoEm: FieldValue.serverTimestamp() });
  }
  return report;
});

export const getSystemBackupDownload = onCall(async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const root = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data');
  const [executor, status] = await Promise.all([root.collection('usuarios').doc(request.auth.uid).get(), root.collection('sistema_operacional').doc('backup').get()]);
  if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
  const path = status.data()?.arquivo?.caminho; if (!path) fail('not-found', 'BACKUP_NAO_ENCONTRADO');
  const [url] = await getBackupBucket(getStorage(), projectId).file(path).getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000, responseDisposition: `attachment; filename="backup-${projectId}.json.gz"` });
  return { url };
});

export const recordDataExport = onCall(async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  let exportRequest; try { exportRequest = validateDataExportRequest(request.data); } catch { fail('invalid-argument', 'EXPORTACAO_INVALIDA'); }
  const { module, rowCount, filters } = exportRequest;
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const root = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data'); const executor = await root.collection('usuarios').doc(request.auth.uid).get();
  if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
  const ref = root.collection('auditoria').doc();
  await ref.set({ tipo: 'DADOS_PESSOAIS_EXPORTADOS', alvoId: module, modulo: module, quantidadeRegistros: rowCount, filtros: filters || null, executadoPor: request.auth.uid, responsavelNome: executor.data().nome || executor.data().email || null, criadoEm: FieldValue.serverTimestamp() });
  return { auditId: ref.id };
});

export const getMemberAreaOverview = onCall({ maxInstances: 5, secrets: r2Secrets }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const requestedMonth = request.data?.month == null ? null : Number(request.data.month);
  if (requestedMonth != null && (!Number.isInteger(requestedMonth) || requestedMonth < 1 || requestedMonth > 12)) fail('invalid-argument', 'MES_INVALIDO');

  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const root = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data');
  const executor = await root.collection('usuarios').doc(request.auth.uid).get();
  const profile = executor.data();
  if (!executor.exists || profile?.ativo === false || !memberAreaRoles.has(profile?.role)) fail('permission-denied', 'AREA_MEMBRO_NAO_AUTORIZADA');

  if (['membro', 'midia'].includes(profile.role)) {
    if (!profile.pessoaBaseId) fail('permission-denied', 'MEMBRO_SEM_VINCULO');
    const person = await root.collection('pessoas').doc(profile.pessoaBaseId).get();
    if (!person.exists || !isActiveMemberRecord(person.data())) fail('permission-denied', 'MEMBRO_INATIVO');
  }

  const now = new Date();
  const start = startOfSaoPauloDay(now);
  const [agendaSnapshot, peopleSnapshot, noticeSnapshot, albumSnapshot, imageAuthorizationSnapshot, mediaSnapshot] = await Promise.all([
    root.collection('agendas').where('data', '>=', Timestamp.fromDate(start)).orderBy('data', 'asc').limit(40).get(),
    root.collection('pessoas').get(),
    root.collection('avisos_membros').where('status', '==', 'publicado').limit(50).get(),
    root.collection('albuns_membros').limit(50).get(),
    root.collection('autorizacoes_imagem').get(),
    root.collection('albuns_membros_arquivos').where('status', '==', 'disponivel').limit(500).get(),
  ]);
  const agendas = agendaSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const people = peopleSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const notices = noticeSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const albums = albumSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const media = mediaSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const imageAuthorizations = imageAuthorizationSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const authorizationItems = selectImageAuthorizations(people, imageAuthorizations);
  const month = requestedMonth || Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', month: '2-digit' }).format(now));
  const selectedAlbums = selectMemberAlbums(albums, { includeDrafts: memberMediaRoles.has(profile.role) });
  const recoverableAlbums = memberMediaRoles.has(profile.role) ? selectRecoverableMemberAlbums(albums, { now }) : [];
  const r2Client = getR2Client(); const bucket = r2BucketName.value();
  const presentAlbum = async album => {
    const cover = media.find(file => file.id === album.capaArquivoId && file.albumId === album.id && file.tipo?.startsWith('image/'));
    if (!cover) return { ...album, arquivos: selectMemberMedia(media.filter(file => file.albumId === album.id)) };
    try {
      const capaUrl = await getSignedUrl(r2Client, new GetObjectCommand({ Bucket: bucket, Key: cover.objectKey, ResponseContentType: cover.tipo }), { expiresIn: 600 });
      return { ...album, capaUrl, arquivos: selectMemberMedia(media.filter(file => file.albumId === album.id)) };
    } catch { return { ...album, arquivos: selectMemberMedia(media.filter(file => file.albumId === album.id)) }; }
  };
  const [albumsWithCovers, archivedAlbumsWithCovers] = await Promise.all([Promise.all(selectedAlbums.map(presentAlbum)), Promise.all(recoverableAlbums.map(presentAlbum))]);
  return {
    mesAniversarios: month,
    calendario: selectMemberCalendar(agendas, { now }),
    aniversariantes: selectMemberBirthdays(people, { month, now }),
    avisos: selectPublishedMemberNotices(notices, { now }),
    albuns: albumsWithCovers,
    albunsArquivados: archivedAlbumsWithCovers,
    autorizacoesImagem: memberMediaRoles.has(profile.role)
      ? authorizationItems
      : authorizationItems.filter(item => item.pessoaId === profile.pessoaBaseId),
  };
});

export const manageImageAuthorization = onCall({ maxInstances: 3 }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const root = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data');
  const executor = await root.collection('usuarios').doc(request.auth.uid).get();
  const profile = executor.data();
  if (!executor.exists || profile?.ativo === false || !['admin', 'gestor'].includes(profile?.role)) fail('permission-denied', 'GESTAO_AUTORIZACAO_IMAGEM_OBRIGATORIA');
  fail('failed-precondition', 'AUTORIZACAO_SOMENTE_DIGITAL');
});

export const createInPersonImageConsentSession = onCall({ maxInstances: 3 }, async () => {
  fail('failed-precondition', 'AUTORIZACAO_EXCLUSIVA_CONTA_MEMBRO');
});

export const submitInPersonImageConsentDecision = onCall({ maxInstances: 5 }, async () => {
  fail('failed-precondition', 'AUTORIZACAO_EXCLUSIVA_CONTA_MEMBRO');
});

export const setMyImageConsent = onCall({ maxInstances: 3 }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  if (typeof request.data?.authorized !== 'boolean') fail('invalid-argument', 'AUTORIZACAO_INVALIDA');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const user = await root.collection('usuarios').doc(request.auth.uid).get();
  const profile = user.data();
  if (!user.exists || profile?.ativo === false || !profile?.pessoaBaseId) fail('permission-denied', 'MEMBRO_SEM_VINCULO');
  const personRef = root.collection('pessoas').doc(profile.pessoaBaseId);
  const authorizationRef = root.collection('autorizacoes_imagem').doc(profile.pessoaBaseId);
  const [person, current] = await Promise.all([personRef.get(), authorizationRef.get()]);
  if (!person.exists || !isActiveMemberRecord(person.data())) fail('failed-precondition', 'MEMBRO_ATIVO_OBRIGATORIO');
  const status = request.data.authorized ? 'autorizado' : 'nao_autorizado';
  const now = Timestamp.now();
  const previousStatus = current.exists && ['titular_email', 'titular_sistema'].includes(current.data()?.origem)
    ? current.data().status
    : person.data()?.consentimentoImagem?.origem !== 'titular_presencial' && person.data()?.consentimentoImagem?.autorizado === true ? 'autorizado'
      : person.data()?.consentimentoImagem?.origem !== 'titular_presencial' && person.data()?.consentimentoImagem?.autorizado === false ? 'nao_autorizado' : 'pendente';
  const evidenceHash = buildImageConsentEvidenceHash({ pessoaId: profile.pessoaBaseId, solicitacaoId: authorizationRef.id, autorizado: request.data.authorized, versaoTermo: IMAGE_CONSENT_VERSION, respondidoEm: now.toDate().toISOString(), canal: 'conta_autenticada', titularUid: request.auth.uid });
  const protocol = evidenceHash.slice(0, 16).toUpperCase();
  const auditRef = root.collection('auditoria').doc();
  const batch = firestore.batch();
  batch.update(personRef, { consentimentoImagem: { autorizado: request.data.authorized, versao: IMAGE_CONSENT_VERSION, registradoEm: now, origem: 'titular_sistema', protocolo: protocol }, atualizadoEm: now, atualizadoPor: request.auth.uid });
  batch.set(authorizationRef, { pessoaId: profile.pessoaBaseId, status, observacao: request.data.authorized ? 'Autorizado pelo membro em Meu Cadastro.' : 'Não autorizado pelo membro em Meu Cadastro.', origem: 'titular_sistema', versaoTermo: IMAGE_CONSENT_VERSION, emailVerificado: true, evidenciaHash: evidenceHash, protocolo: protocol, atualizadoEm: now, atualizadoPor: request.auth.uid, responsavelNome: person.data().nome || profile.nome || null, ...(current.exists ? {} : { criadoEm: now, criadoPor: request.auth.uid }) }, { merge: true });
  batch.set(auditRef, { tipo: 'AUTORIZACAO_IMAGEM_ALTERADA', pessoaId: profile.pessoaBaseId, pessoaNome: person.data().nome || null, statusAnterior: previousStatus, statusNovo: status, motivo: request.data.authorized ? 'Aceite realizado pelo próprio membro autenticado.' : 'Recusa ou revogação realizada pelo próprio membro autenticado.', executadoPor: request.auth.uid, responsavelNome: person.data().nome || profile.nome || null, evidenciaHash: evidenceHash, protocolo: protocol, criadoEm: now });
  await batch.commit();
  return { status, protocol };
});

export const manageMemberNotice = onCall({ maxInstances: 3 }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const action = String(request.data?.action || '').trim();
  const noticeId = String(request.data?.noticeId || '').trim();
  if (!['save', 'archive'].includes(action) || (action === 'archive' && !noticeId)) fail('invalid-argument', 'ACAO_INVALIDA');

  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const executor = await root.collection('usuarios').doc(request.auth.uid).get();
  if (!executor.exists || executor.data()?.ativo === false || !['admin', 'gestor'].includes(executor.data()?.role)) fail('permission-denied', 'GESTAO_AREA_MEMBRO_OBRIGATORIA');

  const noticeRef = noticeId ? root.collection('avisos_membros').doc(noticeId) : root.collection('avisos_membros').doc();
  const current = noticeId ? await noticeRef.get() : null;
  if (noticeId && !current?.exists) fail('not-found', 'AVISO_NAO_ENCONTRADO');
  const auditRef = root.collection('auditoria').doc();
  const now = FieldValue.serverTimestamp();
  const batch = firestore.batch();

  if (action === 'archive') {
    batch.update(noticeRef, { status: 'arquivado', atualizadoEm: now, atualizadoPor: request.auth.uid });
    batch.set(auditRef, { tipo: 'AVISO_MEMBRO_RETIRADO', alvoId: noticeRef.id, executadoPor: request.auth.uid, criadoEm: now });
  } else {
    let payload;
    try { payload = validateMemberNotice(request.data?.notice); }
    catch (error) { fail('invalid-argument', error.message); }
    const data = { titulo: payload.titulo, mensagem: payload.mensagem, destaque: payload.destaque, inicioEm: Timestamp.fromDate(payload.inicioEm), fimEm: payload.fimEm ? Timestamp.fromDate(payload.fimEm) : null, status: 'publicado', atualizadoEm: now, atualizadoPor: request.auth.uid };
    if (current?.exists) batch.update(noticeRef, data);
    else batch.set(noticeRef, { ...data, criadoEm: now, criadoPor: request.auth.uid });
    batch.set(auditRef, { tipo: current?.exists ? 'AVISO_MEMBRO_ATUALIZADO' : 'AVISO_MEMBRO_PUBLICADO', alvoId: noticeRef.id, executadoPor: request.auth.uid, criadoEm: now });
  }
  await batch.commit();
  return { noticeId: noticeRef.id, action };
});

export const manageMemberAlbum = onCall({ maxInstances: 3 }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const action = String(request.data?.action || '').trim();
  const albumId = String(request.data?.albumId || '').trim();
  if (!['save', 'archive', 'restore'].includes(action) || (['archive', 'restore'].includes(action) && !albumId)) fail('invalid-argument', 'ACAO_INVALIDA');

  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const executor = await root.collection('usuarios').doc(request.auth.uid).get();
  const profile = executor.data();
  if (!executor.exists || profile?.ativo === false || !memberMediaRoles.has(profile?.role)) fail('permission-denied', 'GESTAO_MIDIA_OBRIGATORIA');
  if (profile.role === 'midia') {
    if (!profile.pessoaBaseId) fail('permission-denied', 'MEMBRO_SEM_VINCULO');
    const person = await root.collection('pessoas').doc(profile.pessoaBaseId).get();
    if (!person.exists || !isActiveMemberRecord(person.data())) fail('permission-denied', 'MEMBRO_INATIVO');
  }

  const albumRef = albumId ? root.collection('albuns_membros').doc(albumId) : root.collection('albuns_membros').doc();
  const current = albumId ? await albumRef.get() : null;
  if (albumId && !current?.exists) fail('not-found', 'ALBUM_NAO_ENCONTRADO');
  const auditRef = root.collection('auditoria').doc();
  const now = FieldValue.serverTimestamp();
  const batch = firestore.batch();

  if (action === 'archive') {
    const archiveData = { status: 'arquivado', arquivadoEm: now, arquivadoPor: request.auth.uid, atualizadoEm: now, atualizadoPor: request.auth.uid };
    if (current?.data()?.status === 'publicado') { archiveData.retiradoPublicacaoEm = now; archiveData.retiradoPublicacaoPor = request.auth.uid; }
    batch.update(albumRef, archiveData);
    batch.set(auditRef, { tipo: 'ALBUM_MEMBRO_RETIRADO', alvoId: albumRef.id, executadoPor: request.auth.uid, criadoEm: now });
  } else if (action === 'restore') {
    if (current?.data()?.status !== 'arquivado') fail('failed-precondition', 'ALBUM_NAO_ARQUIVADO');
    const archivedDate = current.data()?.arquivadoEm?.toDate?.() || current.data()?.atualizadoEm?.toDate?.();
    if (!archivedDate || Date.now() - archivedDate.getTime() > 30 * 24 * 60 * 60 * 1000) fail('failed-precondition', 'PRAZO_RECUPERACAO_EXPIRADO');
    batch.update(albumRef, { status: 'rascunho', restauradoEm: now, restauradoPor: request.auth.uid, atualizadoEm: now, atualizadoPor: request.auth.uid });
    batch.set(auditRef, { tipo: 'ALBUM_MEMBRO_RESTAURADO', alvoId: albumRef.id, executadoPor: request.auth.uid, criadoEm: now });
  } else {
    let payload;
    try { payload = validateMemberAlbum(request.data?.album); }
    catch (error) { fail('invalid-argument', error.message); }
    if (payload.status === 'publicado' && Number(current?.data()?.quantidadeArquivos || 0) <= 0) fail('failed-precondition', 'ALBUM_SEM_ARQUIVOS');
    if (payload.status === 'publicado' && payload.participantesIds.length) {
      const checks = await Promise.all(payload.participantesIds.map(async pessoaId => {
        const [person, authorization] = await Promise.all([
          root.collection('pessoas').doc(pessoaId).get(),
          root.collection('autorizacoes_imagem').doc(pessoaId).get(),
        ]);
        return {
          pessoaId,
          nome: person.exists ? person.data().nome : 'Membro não localizado',
          autorizado: person.exists && isActiveMemberRecord(person.data()) && (authorization.exists
            ? ['titular_email', 'titular_sistema'].includes(authorization.data().origem) && authorization.data().status === 'autorizado'
            : person.data()?.consentimentoImagem?.origem !== 'titular_presencial' && person.data()?.consentimentoImagem?.autorizado === true),
        };
      }));
      const blocked = checks.filter(item => !item.autorizado);
      if (blocked.length) throw new HttpsError('failed-precondition', 'AUTORIZACAO_IMAGEM_PENDENTE', { nomes: blocked.map(item => item.nome).slice(0, 10) });
    }
    const previousStatus = current?.data()?.status;
    const data = { ...payload, quantidadeArquivos: Number(current?.data()?.quantidadeArquivos || 0), atualizadoEm: now, atualizadoPor: request.auth.uid };
    if (payload.status === 'publicado' && previousStatus !== 'publicado') { data.publicadoEm = now; data.publicadoPor = request.auth.uid; }
    if (payload.status === 'rascunho' && previousStatus === 'publicado') { data.retiradoPublicacaoEm = now; data.retiradoPublicacaoPor = request.auth.uid; }
    if (current?.exists) batch.update(albumRef, data);
    else batch.set(albumRef, { ...data, criadoEm: now, criadoPor: request.auth.uid });
    const auditType = payload.status === 'publicado' && previousStatus !== 'publicado' ? 'ALBUM_MEMBRO_PUBLICADO' : payload.status === 'rascunho' && previousStatus === 'publicado' ? 'ALBUM_MEMBRO_RETIRADO_PUBLICACAO' : current?.exists ? 'ALBUM_MEMBRO_ATUALIZADO' : 'ALBUM_MEMBRO_CRIADO';
    batch.set(auditRef, { tipo: auditType, alvoId: albumRef.id, status: payload.status, executadoPor: request.auth.uid, criadoEm: now });
  }
  await batch.commit();
  return { albumId: albumRef.id, action };
});

export const manageMemberMedia = onCall({ maxInstances: 3, secrets: r2Secrets, timeoutSeconds: 60 }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const action = String(request.data?.action || '').trim();
  if (!['create-upload', 'confirm-upload', 'get-view', 'list-view', 'create-downloads', 'set-cover', 'delete', 'reorder', 'update-details', 'create-inbox-upload', 'confirm-inbox-upload', 'list-inbox', 'move-inbox', 'archive-inbox', 'restore-inbox', 'delete-inbox'].includes(action)) fail('invalid-argument', 'ACAO_INVALIDA');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const executor = await root.collection('usuarios').doc(request.auth.uid).get();
  const profile = executor.data();
  if (!executor.exists || profile?.ativo === false || !memberAreaRoles.has(profile?.role)) fail('permission-denied', 'AREA_MEMBRO_NAO_AUTORIZADA');
  if (['membro', 'midia'].includes(profile.role)) {
    const person = profile.pessoaBaseId ? await root.collection('pessoas').doc(profile.pessoaBaseId).get() : null;
    if (!person?.exists || !isActiveMemberRecord(person.data())) fail('permission-denied', 'MEMBRO_INATIVO');
  }
  const canManage = memberMediaRoles.has(profile.role);
  const bucket = r2BucketName.value();
  const client = getR2Client();

  if (action === 'list-inbox') {
    if (!canManage) fail('permission-denied', 'GESTAO_MIDIA_OBRIGATORIA');
    const snapshot = await root.collection('midia_entrada').get();
    const available = snapshot.docs.filter(item => item.data()?.status === 'disponivel').sort((a, b) => Number(b.data()?.criadoEm?.toMillis?.() || 0) - Number(a.data()?.criadoEm?.toMillis?.() || 0)).slice(0, 100);
    const archived = snapshot.docs.filter(item => item.data()?.status === 'arquivado').sort((a, b) => Number(b.data()?.arquivadoEm?.toMillis?.() || 0) - Number(a.data()?.arquivadoEm?.toMillis?.() || 0)).slice(0, 100);
    const albumSnapshot = await root.collection('albuns_membros_arquivos').get();
    const storageReport = buildMediaStorageReport([...snapshot.docs, ...albumSnapshot.docs].map(item => ({ id: item.id, ...item.data() })));
    const albumsSnapshot = await root.collection('albuns_membros').get();
    const albumTitles = new Map(albumsSnapshot.docs.map(item => [item.id, item.data()?.titulo || 'Álbum sem título']));
    const present = async item => {
      const data = item.data();
      const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: data.objectKey, ResponseContentType: data.tipo }), { expiresIn: 600 });
      const recovery = data.status === 'arquivado' ? getArchivedMediaRecovery(data.arquivadoEm) : {};
      return { id: item.id, nome: data.nome, tipo: data.tipo, tamanho: data.tamanho, url, criadoPor: data.criadoPor, ...recovery, ...(storageReport.duplicateByKey.get(data.objectKey) || {}) };
    };
    const duplicateSources = new Map();
    [...albumSnapshot.docs, ...snapshot.docs].forEach(item => {
      const data = item.data();
      if (data.status === 'removido' || !storageReport.duplicateByKey.has(data.objectKey) || duplicateSources.has(data.objectKey)) return;
      duplicateSources.set(data.objectKey, item);
    });
    const presentDuplicate = async item => {
      const data = item.data();
      const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: data.objectKey, ResponseContentType: data.tipo }), { expiresIn: 600 });
      return { id: item.id, albumId: data.albumId || null, albumTitulo: data.albumId ? albumTitles.get(data.albumId) || 'Álbum não identificado' : null, nome: data.nome, tipo: data.tipo, tamanho: data.tamanho, url, origem: data.albumId ? 'album' : 'entrada', ...storageReport.duplicateByKey.get(data.objectKey) };
    };
    return { files: await Promise.all(available.map(present)), archived: await Promise.all(archived.map(present)), repetidos: await Promise.all([...duplicateSources.values()].map(presentDuplicate)), armazenamento: { totalBytes: storageReport.totalBytes, totalArquivos: storageReport.totalArquivos, duplicados: storageReport.duplicados, economiaPossivelBytes: storageReport.economiaPossivelBytes } };
  }

  if (action === 'create-inbox-upload') {
    if (!canManage) fail('permission-denied', 'GESTAO_MIDIA_OBRIGATORIA');
    const inboxSnapshot = await root.collection('midia_entrada').get();
    if (inboxSnapshot.docs.filter(item => !['removido', 'movido'].includes(item.data()?.status)).length >= MEMBER_MEDIA_INBOX_LIMIT) fail('resource-exhausted', 'LIMITE_ENTRADA_MIDIA');
    let upload; try { upload = validateMemberInboxUpload(request.data); }
    catch (error) { fail('invalid-argument', error.message); }
    const mediaRef = root.collection('midia_entrada').doc();
    const objectKey = `media-inbox/${request.auth.uid}/${mediaRef.id}.${upload.extension}`;
    await mediaRef.set({ nome: upload.fileName, tipo: upload.contentType, tamanho: upload.size, objectKey, status: 'aguardando_envio', origem: 'upload_sistema', criadoPor: request.auth.uid, criadoEm: FieldValue.serverTimestamp() });
    const command = new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: upload.contentType });
    return { mediaId: mediaRef.id, uploadUrl: await getSignedUrl(client, command, { expiresIn: 300 }), expiresIn: 300 };
  }

  if (action === 'confirm-inbox-upload') {
    if (!canManage) fail('permission-denied', 'GESTAO_MIDIA_OBRIGATORIA');
    const mediaId = String(request.data?.mediaId || '').trim();
    const mediaRef = root.collection('midia_entrada').doc(mediaId);
    const media = mediaId ? await mediaRef.get() : null;
    if (!media?.exists || media.data()?.criadoPor !== request.auth.uid || media.data()?.status === 'removido') fail('not-found', 'ARQUIVO_NAO_ENCONTRADO');
    if (media.data()?.status === 'disponivel') return { mediaId, status: 'disponivel' };
    let head; try { head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: media.data().objectKey })); }
    catch { fail('failed-precondition', 'ENVIO_NAO_LOCALIZADO'); }
    if (Number(head.ContentLength) !== Number(media.data().tamanho) || String(head.ContentType || '').toLowerCase() !== media.data().tipo) fail('failed-precondition', 'ARQUIVO_DIVERGENTE');
    const now = FieldValue.serverTimestamp(); const batch = firestore.batch();
    batch.update(mediaRef, { status: 'disponivel', etag: String(head.ETag || '').replace(/^"|"$/g, '').toLowerCase(), confirmadoEm: now, confirmadoPor: request.auth.uid });
    batch.set(root.collection('auditoria').doc(), { tipo: 'MIDIA_ENTRADA_ENVIADA', alvoId: mediaId, nomeArquivo: media.data().nome, tipoArquivo: media.data().tipo, tamanhoArquivo: media.data().tamanho, executadoPor: request.auth.uid, criadoEm: now });
    await batch.commit();
    return { mediaId, status: 'disponivel' };
  }

  if (['move-inbox', 'archive-inbox', 'restore-inbox', 'delete-inbox'].includes(action)) {
    if (!canManage) fail('permission-denied', 'GESTAO_MIDIA_OBRIGATORIA');
    const mediaIds = [...new Set((request.data?.mediaIds || []).map(value => String(value || '').trim()).filter(Boolean))].slice(0, 30);
    if (!mediaIds.length) fail('invalid-argument', 'ARQUIVOS_NAO_INFORMADOS');
    const inboxFiles = await Promise.all(mediaIds.map(id => root.collection('midia_entrada').doc(id).get()));
    const requiredStatus = action === 'restore-inbox' ? 'arquivado' : action === 'delete-inbox' ? null : 'disponivel';
    if (inboxFiles.some(item => !item.exists || (requiredStatus ? item.data()?.status !== requiredStatus : !['disponivel', 'arquivado'].includes(item.data()?.status)))) fail('failed-precondition', 'ARQUIVO_ENTRADA_INDISPONIVEL');
    const now = FieldValue.serverTimestamp();
    const batch = firestore.batch();
    if (action === 'archive-inbox') {
      inboxFiles.forEach(item => {
        batch.update(item.ref, { status: 'arquivado', arquivadoEm: now, arquivadoPor: request.auth.uid });
        batch.set(root.collection('auditoria').doc(), { tipo: 'MIDIA_ENTRADA_ARQUIVADA', alvoId: item.id, nomeArquivo: item.data().nome, executadoPor: request.auth.uid, criadoEm: now });
      });
      await batch.commit();
      return { processed: inboxFiles.length, status: 'arquivado' };
    }
    if (action === 'restore-inbox') {
      if (inboxFiles.some(item => !getArchivedMediaRecovery(item.data()?.arquivadoEm).recuperavel)) fail('failed-precondition', 'PRAZO_RECUPERACAO_EXPIRADO');
      inboxFiles.forEach(item => {
        batch.update(item.ref, { status: 'disponivel', restauradoEm: now, restauradoPor: request.auth.uid });
        batch.set(root.collection('auditoria').doc(), { tipo: 'MIDIA_ENTRADA_RESTAURADA', alvoId: item.id, nomeArquivo: item.data().nome, executadoPor: request.auth.uid, criadoEm: now });
      });
      await batch.commit();
      return { processed: inboxFiles.length, status: 'disponivel' };
    }
    if (action === 'delete-inbox') {
      for (const item of inboxFiles) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.data().objectKey }));
      inboxFiles.forEach(item => {
        batch.update(item.ref, { status: 'removido', removidoEm: now, removidoPor: request.auth.uid });
        batch.set(root.collection('auditoria').doc(), { tipo: 'MIDIA_ENTRADA_REMOVIDA', alvoId: item.id, nomeArquivo: item.data().nome, executadoPor: request.auth.uid, criadoEm: now });
      });
      await batch.commit();
      return { processed: inboxFiles.length, status: 'removido' };
    }
    const targetAlbumId = String(request.data?.albumId || '').trim();
    const targetAlbumRef = root.collection('albuns_membros').doc(targetAlbumId);
    const targetAlbum = targetAlbumId ? await targetAlbumRef.get() : null;
    if (!targetAlbum?.exists || targetAlbum.data()?.status === 'arquivado') fail('not-found', 'ALBUM_NAO_ENCONTRADO');
    const albumFiles = await root.collection('albuns_membros_arquivos').where('albumId', '==', targetAlbumId).get();
    if (albumFiles.docs.filter(item => item.data()?.status !== 'removido').length + inboxFiles.length > MEMBER_MEDIA_LIMIT) fail('failed-precondition', 'LIMITE_ARQUIVOS_ALBUM');
    let firstImageId = '';
    inboxFiles.forEach((item, index) => {
      const data = item.data(); const albumMediaRef = root.collection('albuns_membros_arquivos').doc();
      if (!firstImageId && String(data.tipo || '').startsWith('image/')) firstImageId = albumMediaRef.id;
      const institutionalName = buildInstitutionalMediaName({ album: targetAlbum.data(), originalName: data.nome, contentType: data.tipo, sequence: albumFiles.docs.filter(file => file.data()?.status !== 'removido').length + index + 1 });
      batch.set(albumMediaRef, { albumId: targetAlbumId, nome: institutionalName, nomeOriginal: data.nomeOriginal || data.nome, tipo: data.tipo, tamanho: data.tamanho, objectKey: data.objectKey, etag: data.etag || '', status: 'disponivel', origem: 'entrada_sistema', entradaId: item.id, criadoPor: data.criadoPor, criadoEm: data.criadoEm || now, confirmadoEm: data.confirmadoEm || now, confirmadoPor: data.confirmadoPor || request.auth.uid, movidoEm: now, movidoPor: request.auth.uid });
      batch.update(item.ref, { status: 'movido', albumId: targetAlbumId, movidoEm: now, movidoPor: request.auth.uid });
      batch.set(root.collection('auditoria').doc(), { tipo: 'MIDIA_ENTRADA_MOVIDA_ALBUM', alvoId: item.id, albumId: targetAlbumId, arquivoId: albumMediaRef.id, nomeArquivo: data.nome, executadoPor: request.auth.uid, criadoEm: now });
    });
    const albumUpdate = { quantidadeArquivos: FieldValue.increment(inboxFiles.length), atualizadoEm: now, atualizadoPor: request.auth.uid };
    if (!targetAlbum.data()?.capaArquivoId && firstImageId) albumUpdate.capaArquivoId = firstImageId;
    if (targetAlbum.data()?.status === 'publicado') { albumUpdate.status = 'rascunho'; albumUpdate.retiradoPublicacaoEm = now; albumUpdate.retiradoPublicacaoPor = request.auth.uid; }
    batch.update(targetAlbumRef, albumUpdate);
    await batch.commit();
    return { processed: inboxFiles.length, status: 'movido', albumId: targetAlbumId };
  }

  const albumId = String(request.data?.albumId || '').trim();
  const album = albumId ? await root.collection('albuns_membros').doc(albumId).get() : null;
  if (!album?.exists || album.data()?.status === 'arquivado') fail('not-found', 'ALBUM_NAO_ENCONTRADO');
  if (!canManage && album.data()?.status !== 'publicado') fail('permission-denied', 'ALBUM_NAO_PUBLICADO');

  if (action === 'list-view') {
    const snapshot = await root.collection('albuns_membros_arquivos').where('albumId', '==', albumId).get();
    const files = selectMemberMedia(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    return { files: await Promise.all(files.map(async file => {
      const source = snapshot.docs.find(item => item.id === file.id).data();
      const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: source.objectKey, ResponseContentType: source.tipo }), { expiresIn: 600 });
      return { ...file, url, capa: album.data()?.capaArquivoId === file.id };
    })) };
  }

  if (action === 'create-downloads') {
    if (!canManage) fail('permission-denied', 'DOWNLOAD_MIDIA_NAO_AUTORIZADO');
    const requestedIds = [...new Set((request.data?.mediaIds || []).map(value => String(value || '').trim()).filter(Boolean))].slice(0, MEMBER_MEDIA_LIMIT);
    if (!requestedIds.length) fail('invalid-argument', 'ARQUIVOS_NAO_INFORMADOS');
    const snapshot = await root.collection('albuns_membros_arquivos').where('albumId', '==', albumId).get();
    const selected = snapshot.docs.filter(item => requestedIds.includes(item.id) && item.data()?.status === 'disponivel');
    if (selected.length !== requestedIds.length) fail('failed-precondition', 'ARQUIVO_INDISPONIVEL');
    const downloads = await Promise.all(selected.map(async item => {
      const data = item.data(); const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(data.nome)}`;
      const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: data.objectKey, ResponseContentType: data.tipo, ResponseContentDisposition: disposition }), { expiresIn: 300 });
      return { id: item.id, nome: data.nome, tamanho: Math.max(0, Number(data.tamanho) || 0), url };
    }));
    await root.collection('auditoria').add({ tipo: 'ALBUM_MEMBRO_ARQUIVOS_BAIXADOS', alvoId: albumId, albumId, quantidadeArquivos: downloads.length, arquivosIds: downloads.map(item => item.id), executadoPor: request.auth.uid, criadoEm: FieldValue.serverTimestamp() });
    return { downloads, expiresIn: 300 };
  }

  if (action === 'reorder') {
    if (!canManage) fail('permission-denied', 'GESTAO_MIDIA_OBRIGATORIA');
    const requestedIds = (request.data?.mediaIds || []).map(value => String(value || '').trim()).filter(Boolean);
    const snapshot = await root.collection('albuns_membros_arquivos').where('albumId', '==', albumId).get();
    const availableIds = snapshot.docs.filter(item => item.data()?.status === 'disponivel').map(item => item.id);
    if (requestedIds.length !== availableIds.length || new Set(requestedIds).size !== requestedIds.length || requestedIds.some(id => !availableIds.includes(id))) fail('invalid-argument', 'ORDEM_ARQUIVOS_INVALIDA');
    const now = FieldValue.serverTimestamp(); const batch = firestore.batch();
    requestedIds.forEach((id, index) => batch.update(root.collection('albuns_membros_arquivos').doc(id), { ordem: index, ordenadoEm: now, ordenadoPor: request.auth.uid }));
    batch.update(album.ref, { atualizadoEm: now, atualizadoPor: request.auth.uid });
    batch.set(root.collection('auditoria').doc(), { tipo: 'ALBUM_MEMBRO_ARQUIVOS_ORDENADOS', alvoId: albumId, quantidadeArquivos: requestedIds.length, executadoPor: request.auth.uid, criadoEm: now });
    await batch.commit();
    return { albumId, mediaIds: requestedIds };
  }

  if (action === 'create-upload') {
    if (!canManage) fail('permission-denied', 'GESTAO_MIDIA_OBRIGATORIA');
    let upload; try { upload = validateMemberMediaUpload({ ...request.data, albumId }); }
    catch (error) { fail('invalid-argument', error.message); }
    const existing = await root.collection('albuns_membros_arquivos').where('albumId', '==', albumId).get();
    if (existing.docs.filter(item => item.data()?.status !== 'removido').length >= MEMBER_MEDIA_LIMIT) fail('failed-precondition', 'LIMITE_ARQUIVOS_ALBUM');
    const mediaRef = root.collection('albuns_membros_arquivos').doc();
    const sequence = existing.docs.filter(item => item.data()?.status !== 'removido').length + 1;
    const institutionalName = buildInstitutionalMediaName({ album: album.data(), originalName: upload.fileName, contentType: upload.contentType, sequence });
    await mediaRef.set({ albumId, nome: institutionalName, nomeOriginal: upload.fileName, tipo: upload.contentType, tamanho: upload.size, objectKey: upload.objectKey, status: 'aguardando_envio', criadoPor: request.auth.uid, criadoEm: FieldValue.serverTimestamp() });
    const command = new PutObjectCommand({ Bucket: bucket, Key: upload.objectKey, ContentType: upload.contentType });
    return { mediaId: mediaRef.id, uploadUrl: await getSignedUrl(client, command, { expiresIn: 300 }), expiresIn: 300 };
  }

  const mediaId = String(request.data?.mediaId || '').trim();
  const mediaRef = root.collection('albuns_membros_arquivos').doc(mediaId);
  const media = mediaId ? await mediaRef.get() : null;
  if (!media?.exists || media.data()?.albumId !== albumId || media.data()?.status === 'removido') fail('not-found', 'ARQUIVO_NAO_ENCONTRADO');
  if (action === 'get-view') {
    if (media.data()?.status !== 'disponivel') fail('failed-precondition', 'ARQUIVO_INDISPONIVEL');
    const command = new GetObjectCommand({ Bucket: bucket, Key: media.data().objectKey, ResponseContentType: media.data().tipo });
    return { url: await getSignedUrl(client, command, { expiresIn: 600 }), expiresIn: 600 };
  }

  if (!canManage) fail('permission-denied', 'GESTAO_MIDIA_OBRIGATORIA');
  if (action === 'update-details') {
    if (media.data()?.status !== 'disponivel') fail('failed-precondition', 'ARQUIVO_INDISPONIVEL');
    const legenda = String(request.data?.legenda || '').trim(); const descricaoAlternativa = String(request.data?.descricaoAlternativa || '').trim();
    if (legenda.length > 200 || descricaoAlternativa.length > 500) fail('invalid-argument', 'DETALHES_MIDIA_INVALIDOS');
    const now = FieldValue.serverTimestamp(); const batch = firestore.batch();
    batch.update(mediaRef, { legenda, descricaoAlternativa, atualizadoEm: now, atualizadoPor: request.auth.uid });
    batch.set(root.collection('auditoria').doc(), { tipo: 'ALBUM_MEMBRO_ARQUIVO_DESCRITO', alvoId: mediaId, albumId, nomeArquivo: media.data().nome, executadoPor: request.auth.uid, criadoEm: now });
    await batch.commit(); return { mediaId, legenda, descricaoAlternativa };
  }
  if (action === 'set-cover') {
    if (media.data()?.status !== 'disponivel' || !String(media.data()?.tipo || '').startsWith('image/')) fail('failed-precondition', 'CAPA_INVALIDA');
    const now = FieldValue.serverTimestamp(); const batch = firestore.batch();
    batch.update(album.ref, { capaArquivoId: mediaId, atualizadoEm: now, atualizadoPor: request.auth.uid });
    batch.set(root.collection('auditoria').doc(), { tipo: 'ALBUM_MEMBRO_CAPA_ALTERADA', alvoId: albumId, arquivoId: mediaId, executadoPor: request.auth.uid, criadoEm: now });
    await batch.commit(); return { mediaId, capa: true };
  }
  if (action === 'delete') {
    if (media.data()?.status !== 'disponivel') fail('failed-precondition', 'ARQUIVO_INDISPONIVEL');
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: media.data().objectKey }));
    const now = FieldValue.serverTimestamp(); const batch = firestore.batch();
    batch.update(mediaRef, { status: 'removido', removidoEm: now, removidoPor: request.auth.uid });
    const albumUpdate = { quantidadeArquivos: FieldValue.increment(-1), atualizadoEm: now, atualizadoPor: request.auth.uid };
    if (album.data()?.capaArquivoId === mediaId) albumUpdate.capaArquivoId = FieldValue.delete();
    batch.update(album.ref, albumUpdate);
    batch.set(root.collection('auditoria').doc(), { tipo: 'ALBUM_MEMBRO_ARQUIVO_REMOVIDO', alvoId: mediaId, albumId, nomeArquivo: media.data().nome, executadoPor: request.auth.uid, criadoEm: now });
    await batch.commit(); return { mediaId, status: 'removido' };
  }
  if (media.data()?.status === 'disponivel') return { mediaId, status: 'disponivel' };
  let head; try { head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: media.data().objectKey })); }
  catch { fail('failed-precondition', 'ENVIO_NAO_LOCALIZADO'); }
  if (Number(head.ContentLength) !== Number(media.data().tamanho) || String(head.ContentType || '').toLowerCase() !== media.data().tipo) fail('failed-precondition', 'ARQUIVO_DIVERGENTE');
  const now = FieldValue.serverTimestamp(); const batch = firestore.batch();
  batch.update(mediaRef, { status: 'disponivel', etag: String(head.ETag || '').replace(/^"|"$/g, '').toLowerCase(), confirmadoEm: now, confirmadoPor: request.auth.uid });
  batch.update(album.ref, { quantidadeArquivos: FieldValue.increment(1), atualizadoEm: now, atualizadoPor: request.auth.uid });
  batch.set(root.collection('auditoria').doc(), { tipo: 'ALBUM_MEMBRO_ARQUIVO_ENVIADO', alvoId: mediaId, albumId, nomeArquivo: media.data().nome, tipoArquivo: media.data().tipo, tamanhoArquivo: media.data().tamanho, executadoPor: request.auth.uid, criadoEm: now });
  await batch.commit();
  return { mediaId, status: 'disponivel' };
});

export const manageDriveMediaInbox = onCall({ maxInstances: 2, secrets: driveInboxSecrets, timeoutSeconds: 300, memory: '1GiB' }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const action = String(request.data?.action || '').trim();
  if (!['list', 'import'].includes(action)) fail('invalid-argument', 'ACAO_INVALIDA');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const executor = await root.collection('usuarios').doc(request.auth.uid).get(); const profile = executor.data();
  if (!executor.exists || profile?.ativo === false || !memberMediaRoles.has(profile?.role)) fail('permission-denied', 'GESTAO_MIDIA_OBRIGATORIA');
  if (profile.role === 'midia') {
    const person = profile.pessoaBaseId ? await root.collection('pessoas').doc(profile.pessoaBaseId).get() : null;
    if (!person?.exists || !isActiveMemberRecord(person.data())) fail('permission-denied', 'MEMBRO_INATIVO');
  }
  let token; try { token = await createDriveAccessToken(parseDriveServiceAccount(googleDriveServiceAccount.value())); }
  catch (error) { fail('failed-precondition', error.message); }
  let files; try { files = await listDriveInboxFiles({ accessToken: token, folderId: googleDriveInboxFolderId.value() }); }
  catch (error) { fail('failed-precondition', error.message); }
  const importedSnapshot = await root.collection('albuns_membros_arquivos').where('origem', '==', 'google_drive').get();
  const importedIds = new Set(importedSnapshot.docs.filter(item => item.data()?.status !== 'removido').map(item => item.data()?.driveArquivoId));
  if (action === 'list') return { files: files.map(file => ({ ...file, importado: importedIds.has(file.id) })) };

  const albumId = String(request.data?.albumId || '').trim(); const albumRef = root.collection('albuns_membros').doc(albumId); const album = await albumRef.get();
  if (!album.exists || album.data()?.status === 'arquivado') fail('not-found', 'ALBUM_NAO_ENCONTRADO');
  const requestedIds = [...new Set((request.data?.fileIds || []).map(value => String(value || '').trim()).filter(Boolean))];
  const selectedFiles = requestedIds.map(id => files.find(file => file.id === id)).filter(Boolean);
  if (selectedFiles.some(file => importedIds.has(file.id))) fail('already-exists', 'DRIVE_ARQUIVO_JA_IMPORTADO');
  let uploads; try { uploads = validateDriveImport({ albumId, files: selectedFiles }); }
  catch (error) { fail('invalid-argument', error.message); }
  const currentFiles = await root.collection('albuns_membros_arquivos').where('albumId', '==', albumId).get();
  if (currentFiles.docs.filter(item => item.data()?.status !== 'removido').length + uploads.length > MEMBER_MEDIA_LIMIT) fail('failed-precondition', 'LIMITE_ARQUIVOS_ALBUM');
  const client = getR2Client(); const bucket = r2BucketName.value(); let imported = 0;
  for (let index = 0; index < selectedFiles.length; index += 1) {
    const source = selectedFiles[index]; const upload = uploads[index]; let body;
    try { body = await downloadDriveFile({ accessToken: token, fileId: source.id }); }
    catch (error) { fail('failed-precondition', error.message); }
    const uploadedObject = await client.send(new PutObjectCommand({ Bucket: bucket, Key: upload.objectKey, ContentType: upload.contentType, ContentLength: body.length, Body: body }));
    const now = FieldValue.serverTimestamp(); const mediaRef = root.collection('albuns_membros_arquivos').doc(); const batch = firestore.batch();
    const institutionalName = buildInstitutionalMediaName({ album: album.data(), originalName: upload.fileName, contentType: upload.contentType, sequence: currentFiles.docs.filter(item => item.data()?.status !== 'removido').length + index + 1 });
    batch.set(mediaRef, { albumId, nome: institutionalName, nomeOriginal: upload.fileName, tipo: upload.contentType, tamanho: upload.size, objectKey: upload.objectKey, etag: String(uploadedObject.ETag || '').replace(/^"|"$/g, '').toLowerCase(), status: 'disponivel', origem: 'google_drive', driveArquivoId: source.id, criadoPor: request.auth.uid, criadoEm: now, confirmadoEm: now, confirmadoPor: request.auth.uid });
    batch.update(albumRef, { quantidadeArquivos: FieldValue.increment(1), atualizadoEm: now, atualizadoPor: request.auth.uid });
    batch.set(root.collection('auditoria').doc(), { tipo: 'ALBUM_MEMBRO_ARQUIVO_IMPORTADO_DRIVE', alvoId: mediaRef.id, albumId, driveArquivoId: source.id, nomeArquivo: upload.fileName, executadoPor: request.auth.uid, criadoEm: now });
    await batch.commit(); imported += 1;
  }
  return { imported };
});

export const closeDayWithWorkers = onCall(async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const agendaId = String(request.data?.agendaId || '').trim();
  const mediunsIds = normalizeWorkerIds(request.data?.mediunsIds);
  const cambonesIds = normalizeWorkerIds(request.data?.cambonesIds);
  const substituteMediunsIds = normalizeWorkerIds(request.data?.substituteMediunsIds);
  const substituteCambonesIds = normalizeWorkerIds(request.data?.substituteCambonesIds);
  const eventTeamIds = normalizeWorkerIds(request.data?.eventTeamIds);
  const dirigenteResponsavelId = String(request.data?.dirigenteResponsavelId || '').trim();
  if (!agendaId) fail('invalid-argument', 'DADOS_INVALIDOS');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const configurations = (await root.collection('config_funcoes_membro').get()).docs.map(item => ({ id: item.id, ...item.data() }));
  const workGroups = (await root.collection('config_grupos_trabalho').get()).docs.map(item => ({ id: item.id, ...item.data() }));
  const eventTeamConfigurations = (await root.collection('config_equipe_eventos').get()).docs.map(item => ({ id: item.id, ...item.data() }));
  return firestore.runTransaction(async transaction => {
    const executorRef = root.collection('usuarios').doc(request.auth.uid);
    const executor = await transaction.get(executorRef);
    if (!executor.exists || executor.data().ativo === false || !internalRoles.has(executor.data().role)) fail('permission-denied', 'ACESSO_INTERNO_OBRIGATORIO');
    if (executor.data().pessoaBaseId) {
      const executorPerson = await transaction.get(root.collection('pessoas').doc(executor.data().pessoaBaseId));
      if (!executorPerson.exists || executorPerson.data().ativo === false) fail('permission-denied', 'MEMBRO_INATIVO');
    }
    const agendaRef = root.collection('agendas').doc(agendaId);
    const allMediunsIds = normalizeWorkerIds([...mediunsIds, ...substituteMediunsIds]);
    const allCambonesIds = normalizeWorkerIds([...cambonesIds, ...substituteCambonesIds]);
    const workerIds = [...new Set([...allMediunsIds, ...allCambonesIds])];
    const appointmentsQuery = root.collection('consulentes').where('agendaId', '==', agendaId);
    const responsibleConfigRef = root.collection('config_livro_mediunico').doc('responsaveis');
    const volumesQuery = root.collection('livro_mediunico_volumes');
    const snapshots = await Promise.all([transaction.get(agendaRef), transaction.get(appointmentsQuery), transaction.get(responsibleConfigRef), transaction.get(volumesQuery), ...workerIds.map(id => transaction.get(root.collection('pessoas').doc(id)))]);
    const [agenda, appointments, responsibleConfig, volumeSnapshots, ...people] = snapshots;
    if (!agenda.exists) fail('not-found', 'AGENDA_NAO_ENCONTRADA');
    if (['Concluída', 'Cancelada'].includes(agenda.data().status)) fail('failed-precondition', 'AGENDA_NAO_EDITAVEL');
    const workNature = agenda.data().tipoTrabalhoNatureza || (normalizeWorkName(agenda.data().tipoTrabalhoNome || agenda.data().tipo) === 'atendimento' ? 'atendimento_publico' : 'interno');
    const attendanceOnly = workNature === 'interno';
    const requiresWorkers = workNature === 'atendimento_publico';
    const requiresEventTeam = workNature === 'evento_servicos';
    try { validateDayCanClose(appointments.docs.map(item => item.data()), { attendanceOnly }); }
    catch (error) { fail('failed-precondition', error.message); }
    let workers = []; let scheduled = { groups: [] };
    try {
      if (requiresWorkers) {
        scheduled = getScheduledWorkerIds({ agendaDate: agenda.data().data, groups: workGroups });
        if (mediunsIds.some(id => !scheduled.mediuns.has(id)) || cambonesIds.some(id => !scheduled.cambones.has(id))) throw new Error('TRABALHADOR_FORA_DA_TURMA');
        workers = validateAttendanceWorkers({ mediunsIds: allMediunsIds, cambonesIds: allCambonesIds, peopleById: Object.fromEntries(people.filter(item => item.exists).map(item => [item.id, item.data()])), configurations }).map(item => ({ ...item, substituto: substituteMediunsIds.includes(item.pessoaBaseId) || substituteCambonesIds.includes(item.pessoaBaseId) }));
      } else if (workerIds.length) throw new Error('EQUIPE_NAO_APLICAVEL');
      if (requiresEventTeam) {
        if (!eventTeamIds.length) throw new Error('EQUIPE_EVENTO_OBRIGATORIA');
        if (eventTeamIds.length > 50) throw new Error('LIMITE_EQUIPE_EVENTO');
      } else if (eventTeamIds.length) throw new Error('EQUIPE_EVENTO_NAO_APLICAVEL');
    }
    catch (error) { fail('failed-precondition', error.message); }
    const now = FieldValue.serverTimestamp();
    const attendanceCount = appointments.docs.filter(item => !['Cancelado', 'Reagendado', 'Faltou'].includes(item.data().status)).length;
    const closureType = attendanceOnly ? 'lista_presenca' : requiresWorkers ? 'atendimento' : 'evento_servicos';
    const eventTeamById = Object.fromEntries(eventTeamConfigurations.filter(item => item.ativo !== false).map(item => [item.id, item]));
    if (requiresEventTeam && eventTeamIds.some(id => !eventTeamById[id])) fail('failed-precondition', 'PROFISSIONAL_EVENTO_INVALIDO');
    const eventTeam = eventTeamIds.map(id => ({ id, nome: String(eventTeamById[id].nome || '').trim(), funcao: String(eventTeamById[id].funcao || '').trim() }));
    let bookResponsible = null;
    let monthlyVolume = null; let previousOpenVolumes = []; let previousRecords = [];
    if (requiresWorkers) {
      if (!responsibleConfig.exists) fail('failed-precondition', 'RESPONSAVEIS_LIVRO_NAO_CONFIGURADAS');
      const competence = monthKey(agenda.data().data);
      const volumes = volumeSnapshots.docs;
      monthlyVolume = volumes.find(item => item.data().competencia === competence)
        || volumes.find(item => !item.data().competencia && item.data().status !== 'arquivado' && (String(item.data().periodoInicio || '').startsWith(competence) || item.data().status === 'aberto'));
      if (monthlyVolume?.data().status === 'arquivado') fail('failed-precondition', 'VOLUME_MENSAL_ARQUIVADO');
      previousOpenVolumes = volumes.filter(item => item.data().status === 'aberto' && item.id !== monthlyVolume?.id);
      previousRecords = await Promise.all(previousOpenVolumes.map(volume => transaction.get(root.collection('livro_mediunico_registros').where('volumeId', '==', volume.id))));
      const configured = responsibleConfig.data(); const role = dirigenteResponsavelId === configured.titularPessoaId ? 'titular' : dirigenteResponsavelId === configured.substitutaPessoaId ? 'substituta' : null;
      if (!role) fail('failed-precondition', 'DIRIGENTE_RESPONSAVEL_INVALIDA');
      const responsibleSnapshot = await transaction.get(root.collection('pessoas').doc(dirigenteResponsavelId));
      const responsible = responsibleSnapshot.data();
      if (!responsibleSnapshot.exists || responsible?.ativo === false || !isActiveMemberRecord(responsible) || !isValidCpf(responsible.cpf)) fail('failed-precondition', 'DIRIGENTE_RESPONSAVEL_INVALIDA');
      bookResponsible = { pessoaBaseId: dirigenteResponsavelId, nome: String(responsible.nome || '').trim(), papel: role, cpfFinal: String(responsible.cpf).slice(-2) };
    } else if (dirigenteResponsavelId) fail('failed-precondition', 'DIRIGENTE_NAO_APLICAVEL');
    transaction.update(agendaRef, { status: 'Concluída', concluidaEm: now, concluidaPor: request.auth.uid, ...(attendanceOnly ? { tipoFechamento: closureType, quantidadePresencasFechamento: attendanceCount } : requiresWorkers ? { tipoFechamento: closureType, gruposTrabalhoDia: scheduled.groups.map(group => ({ id: group.id, nome: group.nome })), trabalhadoresDia: workers } : { tipoFechamento: closureType, equipeEventoDia: eventTeam }), atualizadoEm: now, atualizadoPor: request.auth.uid });
    if (requiresWorkers) {
      const competence = monthKey(agenda.data().data);
      previousOpenVolumes.forEach((volume, index) => {
        const records = previousRecords[index].docs.map(item => ({ id: item.id, ...item.data(), dataAtendimento: item.data().dataAtendimento?.toDate?.()?.toISOString?.() || null }));
        const integrityHash = buildBookVolumeHash({ numero: volume.data().numero, records });
        const dates = records.map(item => item.dataAtendimento).filter(Boolean).sort();
        transaction.update(volume.ref, { status: 'encerrado', encerradoAutomaticamente: true, encerradoEm: now, encerradoPor: request.auth.uid, periodoInicio: dates[0] || null, periodoFim: dates.at(-1) || null, quantidadeRegistros: records.length, quantidadeAtendimentos: records.reduce((sum, item) => sum + Number(item.quantidadeAtendimentos || 0), 0), hashIntegridade: integrityHash, codigoVerificacao: integrityHash.slice(0, 12).toUpperCase(), atualizadoEm: now });
        transaction.set(root.collection('auditoria').doc(), { tipo: 'LIVRO_VOLUME_MENSAL_ENCERRADO_AUTOMATICAMENTE', alvoId: volume.id, volumeId: volume.id, volumeNumero: volume.data().numero, competencia: volume.data().competencia || null, codigoVerificacao: integrityHash.slice(0, 12).toUpperCase(), executadoPor: request.auth.uid, criadoEm: now });
      });
      const volumeRef = monthlyVolume?.ref || root.collection('livro_mediunico_volumes').doc(`mensal-${competence}`);
      const volumeNumber = monthlyVolume?.data().numero || volumeSnapshots.docs.reduce((highest, item) => Math.max(highest, Number(item.data().numero) || 0), 0) + 1;
      if (!monthlyVolume) transaction.set(volumeRef, { numero: volumeNumber, competencia: competence, status: 'aberto', abertoEm: now, abertoPor: request.auth.uid, quantidadeRegistros: 1, quantidadeAtendimentos: attendanceCount, criadoEm: now, atualizadoEm: now });
      else transaction.update(volumeRef, { competencia: competence, status: 'aberto', quantidadeRegistros: FieldValue.increment(1), quantidadeAtendimentos: FieldValue.increment(attendanceCount), ...(monthlyVolume.data().status !== 'aberto' || !monthlyVolume.data().competencia ? { reabertoAutomaticamente: true, reabertoEm: now, reabertoPor: request.auth.uid, encerradoEm: FieldValue.delete(), encerradoPor: FieldValue.delete(), hashIntegridade: FieldValue.delete(), codigoVerificacao: FieldValue.delete() } : {}), atualizadoEm: now });
      transaction.set(root.collection('livro_mediunico_registros').doc(agendaId), { agendaId, volumeId: volumeRef.id, volumeNumero: volumeNumber, competencia: competence, dataAtendimento: agenda.data().data, horarioProgramado: agenda.data().horario || null, trabalho: agenda.data().tipoTrabalhoNome || agenda.data().tipo || 'Atendimento', dirigenteResponsavel: bookResponsible, gruposTrabalho: scheduled.groups.map(group => ({ id: group.id, nome: group.nome })), trabalhadores: workers, atendimentos: buildBookAttendances(appointments.docs), quantidadeAtendimentos: attendanceCount, status: 'fechado', fechadoEm: now, fechadoPor: request.auth.uid, criadoEm: now });
      transaction.set(root.collection('auditoria').doc(), { tipo: monthlyVolume ? monthlyVolume.data().status === 'aberto' ? 'LIVRO_VOLUME_MENSAL_ATUALIZADO' : 'LIVRO_VOLUME_MENSAL_REABERTO' : 'LIVRO_VOLUME_MENSAL_ABERTO', alvoId: volumeRef.id, volumeId: volumeRef.id, volumeNumero: volumeNumber, competencia: competence, agendaId, executadoPor: request.auth.uid, criadoEm: now });
      transaction.update(agendaRef, { dirigenteResponsavelDia: bookResponsible });
    }
    transaction.set(root.collection('auditoria').doc(), { tipo: 'AGENDA_CONCLUIDA', agendaId, alvoId: agendaId, tipoFechamento: closureType, quantidadePresencas: attendanceOnly ? attendanceCount : null, gruposTrabalhoIds: scheduled.groups.map(group => group.id), quantidadeMediuns: allMediunsIds.length, quantidadeCambones: allCambonesIds.length, quantidadeSubstitutos: substituteMediunsIds.length + substituteCambonesIds.length, quantidadeEquipeEvento: eventTeam.length, equipeEvento: eventTeam, dirigenteResponsavel: bookResponsible, executadoPor: request.auth.uid, criadoEm: now });
    return { completed: true, workers: workers.length };
  });
});

export const manageBookVolume = onCall(async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const action = String(request.data?.action || '').trim();
  if (!['open', 'close'].includes(action)) fail('invalid-argument', 'ACAO_VOLUME_INVALIDA');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const executor = await root.collection('usuarios').doc(request.auth.uid).get();
  if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
  const volumesSnapshot = await root.collection('livro_mediunico_volumes').get();
  const volumes = volumesSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const openVolumes = volumes.filter(item => item.status === 'aberto');
  if (action === 'open') {
    if (openVolumes.length) fail('already-exists', 'VOLUME_JA_ABERTO');
    const numero = volumes.reduce((highest, item) => Math.max(highest, Number(item.numero) || 0), 0) + 1;
    const ref = root.collection('livro_mediunico_volumes').doc();
    const existingRecords = await root.collection('livro_mediunico_registros').get();
    const pendingRecords = existingRecords.docs.filter(item => !item.data().volumeId);
    const batch = firestore.batch();
    batch.set(ref, { numero, status: 'aberto', abertoEm: FieldValue.serverTimestamp(), abertoPor: request.auth.uid, quantidadeRegistros: pendingRecords.length, quantidadeAtendimentos: pendingRecords.reduce((sum, item) => sum + Number(item.data().quantidadeAtendimentos || 0), 0), criadoEm: FieldValue.serverTimestamp() });
    pendingRecords.forEach(item => batch.update(item.ref, { volumeId: ref.id, volumeNumero: numero }));
    batch.set(root.collection('auditoria').doc(), { tipo: 'LIVRO_VOLUME_ABERTO', alvoId: ref.id, volumeId: ref.id, volumeNumero: numero, registrosAnterioresVinculados: pendingRecords.length, executadoPor: request.auth.uid, criadoEm: FieldValue.serverTimestamp() });
    await batch.commit();
    return { id: ref.id, numero };
  }
  if (openVolumes.length !== 1) fail('failed-precondition', 'VOLUME_ABERTO_NAO_ENCONTRADO');
  const volume = openVolumes[0];
  const recordsSnapshot = await root.collection('livro_mediunico_registros').where('volumeId', '==', volume.id).get();
  if (recordsSnapshot.empty) fail('failed-precondition', 'VOLUME_SEM_REGISTROS');
  const records = recordsSnapshot.docs.map(item => ({ id: item.id, ...item.data(), dataAtendimento: item.data().dataAtendimento?.toDate?.()?.toISOString?.() || null }));
  const integrityHash = buildBookVolumeHash({ numero: volume.numero, records });
  const dates = records.map(item => item.dataAtendimento).filter(Boolean).sort();
  await root.collection('livro_mediunico_volumes').doc(volume.id).update({ status: 'encerrado', encerradoEm: FieldValue.serverTimestamp(), encerradoPor: request.auth.uid, periodoInicio: dates[0] || null, periodoFim: dates.at(-1) || null, quantidadeRegistros: records.length, quantidadeAtendimentos: records.reduce((sum, item) => sum + Number(item.quantidadeAtendimentos || 0), 0), hashIntegridade: integrityHash, codigoVerificacao: integrityHash.slice(0, 12).toUpperCase(), fechamentoAutomaticoErro: FieldValue.delete(), atualizadoEm: FieldValue.serverTimestamp() });
  await root.collection('auditoria').add({ tipo: 'LIVRO_VOLUME_ENCERRADO', alvoId: volume.id, volumeId: volume.id, volumeNumero: volume.numero, codigoVerificacao: integrityHash.slice(0, 12).toUpperCase(), executadoPor: request.auth.uid, criadoEm: FieldValue.serverTimestamp() });
  return { id: volume.id, numero: volume.numero, integrityHash };
});

export const archiveBookVolume = onCall({ timeoutSeconds: 120, memory: '512MiB' }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const volumeId = String(request.data?.volumeId || '').trim();
  const signerPersonId = String(request.data?.signerPersonId || '').trim();
  const signerCpf = normalizeCpf(request.data?.signerCpf);
  const pdfBase64 = String(request.data?.pdfBase64 || '');
  const signatureMethod = String(request.data?.signatureMethod || '');
  if (!volumeId || !signerPersonId || !isValidCpf(signerCpf) || request.data?.confirmed !== true || signatureMethod !== 'gov_br_manual' || !pdfBase64) fail('invalid-argument', 'ASSINATURA_INVALIDA');
  const pdf = Buffer.from(pdfBase64, 'base64');
  if (pdf.length < 5 || pdf.length > 8 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== '%PDF-') fail('invalid-argument', 'PDF_INVALIDO');
  if (!hasEmbeddedPdfDigitalSignature(pdf)) fail('failed-precondition', 'PDF_SEM_ASSINATURA_DIGITAL');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const [executor, volume, config, signer] = await Promise.all([
    root.collection('usuarios').doc(request.auth.uid).get(), root.collection('livro_mediunico_volumes').doc(volumeId).get(),
    root.collection('config_livro_mediunico').doc('responsaveis').get(), root.collection('pessoas').doc(signerPersonId).get(),
  ]);
  if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
  if (!volume.exists || volume.data().status !== 'encerrado') fail('failed-precondition', 'VOLUME_NAO_ENCERRADO');
  const recordsSnapshot = await root.collection('livro_mediunico_registros').where('volumeId', '==', volumeId).get();
  const integrity = verifyBookVolumeHash({ numero: volume.data().numero, records: bookRecordsFromSnapshot(recordsSnapshot), expectedHash: volume.data().hashIntegridade });
  if (!integrity.intact) fail('failed-precondition', 'VOLUME_INTEGRIDADE_DIVERGENTE');
  const role = signerPersonId === config.data()?.titularPessoaId ? 'titular' : signerPersonId === config.data()?.substitutaPessoaId ? 'substituta' : null;
  const signerData = signer.data();
  if (!role || !signer.exists || !isActiveMemberRecord(signerData) || String(signerData.cpf || '').replace(/\D/g, '') !== signerCpf) fail('failed-precondition', 'IDENTIDADE_DIRIGENTE_INVALIDA');
  const fileHash = createHash('sha256').update(pdf).digest('hex');
  const signedAtDate = new Date();
  const signedAt = Timestamp.fromDate(signedAtDate);
  const signerIdentityHash = buildBookSignerIdentityHash({ projectId, signerPersonId, signerCpf });
  const evidence = buildBookSignatureEvidence({ projectId, volumeId, volumeNumber: volume.data().numero, competence: volume.data().competencia, integrityHash: integrity.calculatedHash, fileHash, signerIdentityHash, signerRole: role, signatureMethod, confirmedBy: request.auth.uid, signedAt: signedAtDate.toISOString() });
  const filePath = `livro-mediunico/${projectId}/volume-${Number(volume.data().numero)}-${volumeId}-${fileHash.slice(0, 12)}.pdf`;
  const file = getBookBucket(getStorage(), projectId).file(filePath);
  await file.save(pdf, { resumable: false, contentType: 'application/pdf', metadata: { cacheControl: 'private, no-store', metadata: { volumeId, sha256: fileHash, evidenceHash: evidence.evidenciaHash } } });
  await firestore.runTransaction(async transaction => {
    const freshVolume = await transaction.get(root.collection('livro_mediunico_volumes').doc(volumeId));
    if (!freshVolume.exists || freshVolume.data().status !== 'encerrado') fail('failed-precondition', 'VOLUME_NAO_ENCERRADO');
    if (freshVolume.data().hashIntegridade !== integrity.calculatedHash) fail('failed-precondition', 'VOLUME_INTEGRIDADE_DIVERGENTE');
    const signature = { pessoaBaseId: signerPersonId, nome: String(signerData.nome || '').trim(), papel: role, cpfFinal: signerCpf.slice(-2), metodo: signatureMethod, assinaturaDigitalDetectada: true, certificadoValidadoPeloSistema: false, confirmadoPor: request.auth.uid, identidadeHash: signerIdentityHash, ...evidence };
    transaction.update(freshVolume.ref, { status: 'arquivado', arquivo: { caminho: filePath, nome: `livro-mediunico-volume-${Number(volume.data().numero)}.pdf`, tamanho: pdf.length, mimeType: 'application/pdf', hashSha256: fileHash }, assinatura: signature, assinadoEm: signedAt, arquivadoEm: signedAt, arquivadoPor: request.auth.uid, atualizadoEm: signedAt });
    transaction.set(root.collection('auditoria').doc(), { tipo: 'LIVRO_VOLUME_ARQUIVADO', alvoId: volumeId, volumeId, volumeNumero: volume.data().numero, dirigenteResponsavel: signature, hashArquivo: fileHash, hashEvidencia: evidence.evidenciaHash, codigoEvidencia: evidence.codigoEvidencia, executadoPor: request.auth.uid, criadoEm: signedAt });
  });
  return { archived: true, fileHash, evidenceCode: evidence.codigoEvidencia };
});

export const resetArchivedBookVolumeForHml = onCall(async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const volumeId = String(request.data?.volumeId || '').trim();
  if (!volumeId) fail('invalid-argument', 'VOLUME_OBRIGATORIO');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const executor = await root.collection('usuarios').doc(request.auth.uid).get();
  const volumeRef = root.collection('livro_mediunico_volumes').doc(volumeId);
  await firestore.runTransaction(async transaction => {
    const volume = await transaction.get(volumeRef);
    const admin = executor.exists && isActiveAdmin(executor.data());
    if (!volume.exists || !canResetArchivedBookInHml({ projectId, status: volume.data()?.status, isAdmin: admin })) fail('permission-denied', 'RESET_VOLUME_SOMENTE_HML_ADMIN');
    const data = volume.data(); const historyRef = root.collection('livro_mediunico_reaberturas_hml').doc(); const now = FieldValue.serverTimestamp();
    transaction.set(historyRef, { volumeId, volumeNumero: data.numero, competencia: data.competencia || null, motivo: 'Reset administrativo para simulação de assinatura no HML', estadoAnterior: { status: data.status, arquivo: data.arquivo || null, assinatura: data.assinatura || null, assinadoEm: data.assinadoEm || null, arquivadoEm: data.arquivadoEm || null, arquivadoPor: data.arquivadoPor || null }, criadoEm: now, executadoPor: request.auth.uid });
    transaction.update(volumeRef, { status: 'encerrado', arquivo: FieldValue.delete(), assinatura: FieldValue.delete(), assinadoEm: FieldValue.delete(), arquivadoEm: FieldValue.delete(), arquivadoPor: FieldValue.delete(), reabertoParaTesteHml: true, reabertoEm: now, reabertoPor: request.auth.uid, reabertoMotivo: 'Reset administrativo para simulação de assinatura no HML', atualizadoEm: now });
    transaction.set(root.collection('auditoria').doc(), { tipo: 'LIVRO_VOLUME_REABERTO_PARA_TESTE_HML', alvoId: volumeId, volumeId, volumeNumero: data.numero, competencia: data.competencia || null, motivo: 'Reset administrativo para simulação de assinatura no HML', historicoReaberturaId: historyRef.id, executadoPor: request.auth.uid, criadoEm: now });
  });
  return { reset: true, volumeId };
});

export const verifyBookVolumeIntegrity = onCall(async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const volumeId = String(request.data?.volumeId || '').trim();
  if (!volumeId) fail('invalid-argument', 'VOLUME_OBRIGATORIO');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const [executor, volume, recordsSnapshot] = await Promise.all([
    root.collection('usuarios').doc(request.auth.uid).get(),
    root.collection('livro_mediunico_volumes').doc(volumeId).get(),
    root.collection('livro_mediunico_registros').where('volumeId', '==', volumeId).get(),
  ]);
  if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
  if (!volume.exists || !['encerrado', 'arquivado'].includes(volume.data().status)) fail('failed-precondition', 'VOLUME_NAO_ENCERRADO');
  const result = verifyBookVolumeHash({ numero: volume.data().numero, records: bookRecordsFromSnapshot(recordsSnapshot), expectedHash: volume.data().hashIntegridade });
  const now = FieldValue.serverTimestamp();
  await root.collection('auditoria').add({ tipo: 'LIVRO_VOLUME_INTEGRIDADE_VERIFICADA', alvoId: volumeId, volumeId, volumeNumero: volume.data().numero, resultado: result.intact ? 'integro' : 'divergente', codigoVerificacao: result.calculatedHash.slice(0, 12).toUpperCase(), executadoPor: request.auth.uid, criadoEm: now });
  await volume.ref.update({ ultimaVerificacaoIntegridade: { resultado: result.intact ? 'integro' : 'divergente', verificadoPor: request.auth.uid, verificadoEm: now }, atualizadoEm: now });
  return { intact: result.intact, verificationCode: result.calculatedHash.slice(0, 12).toUpperCase() };
});

export const verifyBookStorageHealth = onCall(async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const executor = await root.collection('usuarios').doc(request.auth.uid).get();
  if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
  try {
    const result = await verifyBookStorageAccess({ storage: getStorage(), projectId });
    await root.collection('auditoria').add({ tipo: 'LIVRO_STORAGE_VERIFICADO', resultado: 'disponivel', executadoPor: request.auth.uid, criadoEm: FieldValue.serverTimestamp() });
    return result;
  } catch (error) {
    console.error('verifyBookStorageHealth failed', { code: error.code, message: error.message });
    fail('failed-precondition', 'LIVRO_STORAGE_INDISPONIVEL');
  }
});

export const removeOrphanAccessIndex = onCall({ maxInstances: 3 }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const pessoaBaseId = String(request.data?.pessoaBaseId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(pessoaBaseId)) fail('invalid-argument', 'INDICE_INVALIDO');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const executorRef = root.collection('usuarios').doc(request.auth.uid);
  const indexRef = root.collection('usuario_pessoa_index').doc(pessoaBaseId);
  return firestore.runTransaction(async transaction => {
    const [executor, index, person] = await Promise.all([
      transaction.get(executorRef),
      transaction.get(indexRef),
      transaction.get(root.collection('pessoas').doc(pessoaBaseId)),
    ]);
    if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
    if (!index.exists) return { removed: false, reason: 'INDICE_JA_REMOVIDO' };
    const uid = String(index.data().uid || '').trim();
    const user = uid ? await transaction.get(root.collection('usuarios').doc(uid)) : null;
    const reason = getOrphanAccessIndexReason({
      personExists: person.exists,
      userExists: Boolean(user?.exists),
      userPessoaBaseId: user?.data()?.pessoaBaseId || null,
      pessoaBaseId,
    });
    if (!reason) fail('failed-precondition', 'INDICE_NAO_E_ORFAO');
    transaction.delete(indexRef);
    transaction.set(root.collection('auditoria').doc(), {
      tipo: 'INDICE_ACESSO_ORFAO_REMOVIDO',
      alvoId: pessoaBaseId,
      pessoaBaseId,
      uid: uid || null,
      motivo: reason,
      executadoPor: request.auth.uid,
      criadoEm: FieldValue.serverTimestamp(),
    });
    return { removed: true, reason };
  });
});

export const checkBookVolumeAuthenticity = onCall(async request => {
  const verificationCode = String(request.data?.verificationCode || '').trim().toUpperCase();
  if (!/^[A-F0-9]{12}$/.test(verificationCode)) fail('invalid-argument', 'CODIGO_VERIFICACAO_INVALIDO');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const volumes = await root.collection('livro_mediunico_volumes').where('codigoVerificacao', '==', verificationCode).limit(1).get();
  if (volumes.empty) return { found: false };
  const volume = volumes.docs[0];
  const recordsSnapshot = await root.collection('livro_mediunico_registros').where('volumeId', '==', volume.id).get();
  const integrity = verifyBookVolumeHash({ numero: volume.data().numero, records: bookRecordsFromSnapshot(recordsSnapshot), expectedHash: volume.data().hashIntegridade });
  await volume.ref.update({ consultasAutenticidade: FieldValue.increment(1), ultimaConsultaAutenticidadeEm: FieldValue.serverTimestamp() });
  return buildPublicBookAuthenticity({ volume: volume.data(), integrityIntact: integrity.intact });
});

export const getBookVolumeDownload = onCall(async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const volumeId = String(request.data?.volumeId || '').trim();
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const [executor, volume] = await Promise.all([root.collection('usuarios').doc(request.auth.uid).get(), root.collection('livro_mediunico_volumes').doc(volumeId).get()]);
  if (!executor.exists || executor.data().ativo === false || !['admin', 'gestor'].includes(executor.data().role)) fail('permission-denied', 'ACESSO_NEGADO');
  if (!volume.exists || volume.data().status !== 'arquivado' || !volume.data().arquivo?.caminho) fail('not-found', 'ARQUIVO_NAO_ENCONTRADO');
  const [url] = await getBookBucket(getStorage(), projectId).file(volume.data().arquivo.caminho).getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000, responseDisposition: `attachment; filename="${volume.data().arquivo.nome}"` });
  return { url, expiresInSeconds: 600 };
});

export const refreshBookRecord = onCall(async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const recordId = String(request.data?.recordId || '').trim();
  const reason = String(request.data?.reason || '').trim();
  if (!recordId || reason.length < 5 || reason.length > 500) fail('invalid-argument', 'MOTIVO_OBRIGATORIO');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  return firestore.runTransaction(async transaction => {
    const recordRef = root.collection('livro_mediunico_registros').doc(recordId);
    const [executor, record] = await Promise.all([transaction.get(root.collection('usuarios').doc(request.auth.uid)), transaction.get(recordRef)]);
    if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
    if (!record.exists) fail('not-found', 'REGISTRO_LIVRO_NAO_ENCONTRADO');
    const volumeRef = root.collection('livro_mediunico_volumes').doc(record.data().volumeId);
    const agendaRef = root.collection('agendas').doc(record.data().agendaId);
    const [volume, agenda, appointments, volumeRecords] = await Promise.all([
      transaction.get(volumeRef), transaction.get(agendaRef), transaction.get(root.collection('consulentes').where('agendaId', '==', record.data().agendaId)), transaction.get(root.collection('livro_mediunico_registros').where('volumeId', '==', record.data().volumeId)),
    ]);
    if (!volume.exists || volume.data().status === 'arquivado') fail('failed-precondition', 'VOLUME_ARQUIVADO');
    if (!agenda.exists) fail('not-found', 'AGENDA_NAO_ENCONTRADA');
    const atendimentos = buildBookAttendances(appointments.docs);
    const now = FieldValue.serverTimestamp();
    transaction.update(recordRef, { horarioProgramado: agenda.data().horario || null, trabalho: agenda.data().tipoTrabalhoNome || agenda.data().tipo || record.data().trabalho || 'Atendimento', atendimentos, quantidadeAtendimentos: atendimentos.filter(item => !['Cancelado', 'Reagendado', 'Faltou'].includes(item.status)).length, conferidoEm: now, conferidoPor: request.auth.uid, motivoConferencia: reason });
    if (volume.data().status === 'encerrado') {
      const records = volumeRecords.docs.map(item => ({ id: item.id, ...item.data(), ...(item.id === recordId ? { atendimentos, quantidadeAtendimentos: atendimentos.filter(entry => !['Cancelado', 'Reagendado', 'Faltou'].includes(entry.status)).length } : {}), dataAtendimento: item.data().dataAtendimento?.toDate?.()?.toISOString?.() || null }));
      const integrityHash = buildBookVolumeHash({ numero: volume.data().numero, records });
      transaction.update(volumeRef, { quantidadeAtendimentos: records.reduce((sum, item) => sum + Number(item.quantidadeAtendimentos || 0), 0), hashIntegridade: integrityHash, codigoVerificacao: integrityHash.slice(0, 12).toUpperCase(), atualizadoEm: now });
    }
    transaction.set(root.collection('auditoria').doc(), { tipo: 'LIVRO_REGISTRO_CONFERIDO', alvoId: recordId, volumeId: record.data().volumeId, agendaId: record.data().agendaId, motivo: reason, quantidadeAtendimentos: atendimentos.length, executadoPor: request.auth.uid, criadoEm: now });
    return { refreshed: true, attendances: atendimentos.length };
  });
});

export const updateWorkType = onCall(async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const workTypeId = String(request.data?.workTypeId || '').trim();
  const nome = normalizeDisplayText(request.data?.nome);
  const natureza = request.data?.natureza;
  const publicosPermitidos = natureza === 'interno' ? ['membro'] : [...new Set(request.data?.publicosPermitidos || [])].filter(item => ['consulente', 'membro'].includes(item));
  if (!workTypeId || !nome || !['atendimento_publico', 'evento_servicos', 'interno'].includes(natureza) || !publicosPermitidos.length) fail('invalid-argument', 'TIPO_TRABALHO_INVALIDO');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  return firestore.runTransaction(async transaction => {
    const [executor, workType, agendas] = await Promise.all([
      transaction.get(root.collection('usuarios').doc(request.auth.uid)),
      transaction.get(root.collection('config_eventos').doc(workTypeId)),
      transaction.get(root.collection('agendas').where('tipoTrabalhoId', '==', workTypeId)),
    ]);
    if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
    if (!workType.exists) fail('not-found', 'TIPO_TRABALHO_NAO_ENCONTRADO');
    const currentNature = workType.data().natureza || (normalizeWorkName(workType.data().nome) === 'atendimento' ? 'atendimento_publico' : 'interno');
    if (currentNature !== natureza && agendas.docs.some(item => !['Concluída', 'Cancelada'].includes(item.data().status))) fail('failed-precondition', 'AGENDA_EM_ANDAMENTO');
    transaction.update(workType.ref, { nome, natureza, publicosPermitidos, atualizadoEm: FieldValue.serverTimestamp(), atualizadoPor: request.auth.uid });
    return { updated: true };
  });
});

export const updateAppointment = onCall(async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const appointmentId = String(request.data?.appointmentId || '').trim();
  const destinationAgendaId = String(request.data?.destinationAgendaId || '').trim();
  const personId = String(request.data?.personId || '').trim();
  const serviceIds = [...new Set((request.data?.serviceIds || []).map(value => String(value || '').trim()).filter(Boolean))];
  const observation = String(request.data?.observation || '').trim().slice(0, 500);
  const reason = String(request.data?.reason || '').trim();
  if (!appointmentId || !destinationAgendaId || !personId || !serviceIds.length || serviceIds.length > 20 || reason.length < 3 || reason.length > 500) fail('invalid-argument', 'EDICAO_AGENDAMENTO_INVALIDA');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  return firestore.runTransaction(async transaction => {
    const appointmentRef = root.collection('consulentes').doc(appointmentId);
    const destinationAgendaRef = root.collection('agendas').doc(destinationAgendaId);
    const personRef = root.collection('pessoas').doc(personId);
    const [executor, appointmentSnapshot, destinationAgendaSnapshot, personSnapshot, ...serviceSnapshots] = await Promise.all([
      transaction.get(root.collection('usuarios').doc(request.auth.uid)), transaction.get(appointmentRef), transaction.get(destinationAgendaRef), transaction.get(personRef),
      ...serviceIds.map(id => transaction.get(root.collection('config_servicos').doc(id))),
    ]);
    if (!executor.exists || executor.data().ativo === false || !['admin', 'gestor'].includes(executor.data().role)) fail('permission-denied', 'GESTAO_AGENDA_OBRIGATORIA');
    if (!appointmentSnapshot.exists || !destinationAgendaSnapshot.exists || !personSnapshot.exists) fail('not-found', 'REGISTRO_NAO_ENCONTRADO');
    const appointment = appointmentSnapshot.data(); const destinationAgenda = destinationAgendaSnapshot.data(); const person = personSnapshot.data();
    if (appointment.status !== 'Agendado') fail('failed-precondition', 'AGENDAMENTO_JA_INICIADO');
    if (person.ativo === false || ['Concluída', 'Cancelada'].includes(destinationAgenda.status) || destinationAgenda.ativo === false) fail('failed-precondition', 'DESTINO_INDISPONIVEL');
    const publicos = destinationAgenda.publicosPermitidos || [];
    const vinculo = String(person.vinculo || person.tipoPessoa || '').toLowerCase().includes('membro') ? 'membro' : 'consulente';
    if (publicos.length && !publicos.includes(vinculo)) fail('failed-precondition', 'PUBLICO_NAO_PERMITIDO');
    if (destinationAgenda.cpfObrigatorio === true && !isValidCpf(person.cpf)) fail('failed-precondition', 'CPF_OBRIGATORIO_EVENTO');
    if (serviceSnapshots.some(snapshot => !snapshot.exists || snapshot.data().ativo === false)) fail('failed-precondition', 'SERVICO_INVALIDO');
    if (serviceIds.some(id => !(destinationAgenda.servicosIds || []).includes(id) || destinationAgenda.servicosStatus?.[id] === 'Cancelado')) fail('failed-precondition', 'SERVICO_NAO_DISPONIVEL');
    const originAgendaRef = root.collection('agendas').doc(appointment.agendaId); const originAgendaSnapshot = appointment.agendaId === destinationAgendaId ? destinationAgendaSnapshot : await transaction.get(originAgendaRef);
    if (!originAgendaSnapshot.exists || ['Concluída', 'Cancelada'].includes(originAgendaSnapshot.data().status)) fail('failed-precondition', 'ORIGEM_INDISPONIVEL');
    const originLockRef = root.collection('agendamentos_ativos').doc(`${appointment.agendaId}_${appointment.pessoaBaseId}`);
    const destinationLockRef = root.collection('agendamentos_ativos').doc(`${destinationAgendaId}_${personId}`);
    const [originLock, destinationLock] = await Promise.all([transaction.get(originLockRef), transaction.get(destinationLockRef)]);
    if (!originLock.exists || originLock.data().agendamentoId !== appointmentId) fail('failed-precondition', 'LOCK_ORIGEM_DIVERGENTE');
    if (destinationLock.exists && destinationLock.data().agendamentoId !== appointmentId) fail('already-exists', 'DESTINO_POSSUI_ATENDIMENTO');
    const controlsVacancies = Object.fromEntries(serviceSnapshots.map((snapshot, index) => [serviceIds[index], snapshot.data().controlaVagas ?? snapshot.data().requerVagas ?? false]));
    const originOccupied = { ...(originAgendaSnapshot.data().vagasOcupadas || {}) }; const destinationOccupied = appointment.agendaId === destinationAgendaId ? originOccupied : { ...(destinationAgenda.vagasOcupadas || {}) };
    (appointment.servicosIds || []).forEach(id => { if (Object.hasOwn(originOccupied, id)) originOccupied[id] = Math.max(0, Number(originOccupied[id] || 0) - 1); });
    serviceIds.forEach(id => { if (!controlsVacancies[id]) return; const current = Number(destinationOccupied[id] || 0); const total = Number(destinationAgenda.vagasTotais?.[id] || 0); if (current >= total) fail('resource-exhausted', `SEM_VAGA:${serviceSnapshots[serviceIds.indexOf(id)].data().nome || id}`); destinationOccupied[id] = current + 1; });
    const historyRef = root.collection('agenda_historico_index').doc(destinationAgendaId); const history = await transaction.get(historyRef);
    const now = FieldValue.serverTimestamp(); const oldLockId = originLockRef.id; const newLockId = destinationLockRef.id;
    transaction.update(originAgendaRef, { vagasOcupadas: originOccupied, atualizadoEm: now, atualizadoPor: request.auth.uid });
    if (appointment.agendaId !== destinationAgendaId) transaction.update(destinationAgendaRef, { vagasOcupadas: destinationOccupied, atualizadoEm: now, atualizadoPor: request.auth.uid });
    if (oldLockId !== newLockId) { transaction.delete(originLockRef); transaction.set(destinationLockRef, { agendaId: destinationAgendaId, pessoaBaseId: personId, agendamentoId: appointmentId, criadoEm: now, criadoPor: request.auth.uid }); }
    transaction.update(appointmentRef, { agendaId: destinationAgendaId, pessoaBaseId: personId, nome: String(person.nome || '').trim(), cpf: person.cpf || '', servicosIds: serviceIds, servicosNomes: serviceSnapshots.map(snapshot => snapshot.data().nome), ...(observation ? { observacao: observation } : { observacao: FieldValue.delete() }), atualizadoEm: now, atualizadoPor: request.auth.uid });
    if (!history.exists) transaction.set(historyRef, { agendaId: destinationAgendaId, primeiroAgendamentoId: appointmentId, criadoEm: now, criadoPor: request.auth.uid });
    transaction.set(root.collection('auditoria').doc(), { tipo: 'AGENDAMENTO_EDITADO', alvoId: appointmentId, agendaId: destinationAgendaId, agendamentoId: appointmentId, pessoaBaseId: personId, pessoaAnteriorId: appointment.pessoaBaseId, pessoaNovaId: personId, agendaAnteriorId: appointment.agendaId, agendaNovaId: destinationAgendaId, servicosAnteriores: appointment.servicosIds || [], servicosNovos: serviceIds, observacaoAlterada: String(appointment.observacao || '') !== observation, motivo: reason, executadoPor: request.auth.uid, criadoEm: now });
    return { updated: true };
  });
});

export const archiveAuditHistory = onCall(async request => {
  if (!request.auth) fail('unauthenticated', 'LOGIN_OBRIGATORIO');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const executor = await root.collection('usuarios').doc(request.auth.uid).get();
  if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
  const cutoffDate = new Date();
  cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - AUDIT_RETENTION_MONTHS);
  const cutoff = Timestamp.fromDate(cutoffDate);
  const collect = async field => (await root.collection('auditoria').where(field, '<', cutoff).limit(200).get()).docs;
  const candidates = [...new Map([...(await collect('criadoEm')), ...(await collect('executadoEm'))].map(snapshot => [snapshot.id, snapshot])).values()].slice(0, 200);
  if (request.data?.action !== 'archive') return { eligible: candidates.length, retentionMonths: AUDIT_RETENTION_MONTHS, cutoff: cutoffDate.toISOString() };
  if (!candidates.length) return { archived: 0, retentionMonths: AUDIT_RETENTION_MONTHS };
  const batch = firestore.batch();
  const archivedAt = Timestamp.now();
  candidates.forEach(snapshot => {
    batch.create(root.collection('auditoria_arquivada').doc(snapshot.id), { ...snapshot.data(), registroOriginalId: snapshot.id, arquivadoEm: archivedAt, arquivadoPor: request.auth.uid, politicaRetencaoMeses: AUDIT_RETENTION_MONTHS });
    batch.delete(snapshot.ref);
  });
  await batch.commit();
  return { archived: candidates.length, retentionMonths: AUDIT_RETENTION_MONTHS };
});

const approvedRegistrationEmailHandler = async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!shouldSendApprovedRegistrationEmail({ before, after })) return;
  const reference = event.data.after.ref;
  const projectId = event.params.projectId;
  const root = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data');
  const communicationRef = root.collection('comunicacoes_email').doc(`cadastro_aprovado_${event.params.requestId}`);
  try {
    await reference.update({
      'notificacaoEmail.status': 'enviando',
      'notificacaoEmail.atualizadoEm': FieldValue.serverTimestamp(),
    });
    await communicationRef.set({ pessoaBaseId: after.pessoaId, tipo: 'cadastro_aprovado', destinatario: after.email, nome: after.nome || null, status: 'enviando', origemId: event.params.requestId, criadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
    await sendMailjetEmail({
      apiKey: mailjetApiKey.value(),
      secretKey: mailjetSecretKey.value(),
      fromEmail: registrationEmailFrom.value(),
      registration: after,
    });
    await reference.update({
      'notificacaoEmail.status': 'enviado',
      'notificacaoEmail.enviadoEm': FieldValue.serverTimestamp(),
      'notificacaoEmail.erro': FieldValue.delete(),
    });
    await communicationRef.update({ status: 'enviado', enviadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp(), erro: FieldValue.delete() });
  } catch (error) {
    console.error('approved registration email failed', { requestId: event.params.requestId, code: error.message });
    await reference.update({
      'notificacaoEmail.status': 'erro',
      'notificacaoEmail.erro': 'ENVIO_NAO_CONCLUIDO',
      'notificacaoEmail.atualizadoEm': FieldValue.serverTimestamp(),
    });
    await communicationRef.set({ pessoaBaseId: after.pessoaId, tipo: 'cadastro_aprovado', destinatario: after.email, nome: after.nome || null, status: 'erro', origemId: event.params.requestId, erro: 'ENVIO_NAO_CONCLUIDO', criadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
  }
};

const registrationEmailOptions = {
  region: 'southamerica-east1',
  maxInstances: 3,
  secrets: [mailjetApiKey, mailjetSecretKey, registrationEmailFrom],
};

export const sendApprovedReusableRegistrationEmail = onDocumentUpdated({
  ...registrationEmailOptions,
  document: 'artifacts/{projectId}/public/data/solicitacoes_cadastro/{requestId}',
}, approvedRegistrationEmailHandler);

export const sendApprovedLegacyRegistrationEmail = onDocumentUpdated({
  ...registrationEmailOptions,
  document: 'artifacts/{projectId}/public/data/autocadastros_membro/{requestId}',
}, approvedRegistrationEmailHandler);

export const sealReusableRegistrationEvidence = onDocumentCreated({
  region: 'southamerica-east1',
  document: 'artifacts/{projectId}/public/data/solicitacoes_cadastro/{requestId}',
}, async event => {
  const registration = event.data?.data();
  if (!registration?.aceite || registration.aceite.protocolo !== event.params.requestId || registration.aceite.resumoConteudo) return;
  await event.data.ref.update({
    'aceite.resumoConteudo': buildRegistrationEvidenceHash(registration),
    'aceite.registradoEm': FieldValue.serverTimestamp(),
  });
});

const sendAccountMessage = ({ email, nome, message }) => sendMailjetMessage({ apiKey: mailjetApiKey.value(), secretKey: mailjetSecretKey.value(), fromEmail: registrationEmailFrom.value(), toEmail: email, toName: nome, ...message });
const deliverTrackedAccountEmail = async ({ root, pessoaBaseId, tipo, email, nome, message, reenviadoDe = null, origemId = null }) => {
  const ref = root.collection('comunicacoes_email').doc();
  await ref.set({ pessoaBaseId, tipo, destinatario: email, nome: nome || null, status: 'enviando', ...(reenviadoDe ? { reenviadoDe } : {}), ...(origemId ? { origemId } : {}), criadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp() });
  try {
    await sendAccountMessage({ email, nome, message });
    await ref.update({ status: 'enviado', enviadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp() });
  } catch (error) {
    await ref.update({ status: 'erro', erro: 'ENVIO_NAO_CONCLUIDO', atualizadoEm: FieldValue.serverTimestamp() });
    throw error;
  }
  return ref.id;
};
const mailjetCallableOptions = { region: 'southamerica-east1', maxInstances: 3, secrets: [mailjetApiKey, mailjetSecretKey, registrationEmailFrom] };

export const sendImageConsentInvitations = onCall(mailjetCallableOptions, async request => {
  fail('failed-precondition', 'FLUXO_EMAIL_AUTORIZACAO_DESATIVADO');
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const pessoaIds = [...new Set((request.data?.pessoaIds || []).map(value => String(value || '').trim()).filter(Boolean))];
  if (!pessoaIds.length || pessoaIds.length > 50) fail('invalid-argument', 'MEMBROS_INVALIDOS');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const executor = await root.collection('usuarios').doc(request.auth.uid).get();
  if (!executor.exists || executor.data()?.ativo === false || !['admin', 'gestor'].includes(executor.data()?.role)) fail('permission-denied', 'GESTAO_AUTORIZACAO_IMAGEM_OBRIGATORIA');
  const results = [];
  for (const pessoaId of pessoaIds) {
    const personRef = root.collection('pessoas').doc(pessoaId);
    const authorizationRef = root.collection('autorizacoes_imagem').doc(pessoaId);
    const [person, authorization] = await Promise.all([personRef.get(), authorizationRef.get()]);
    const personData = person.data();
    const email = normalizeVerificationEmail(personData?.email);
    const effectiveStatus = ['titular_email', 'titular_sistema'].includes(authorization.data()?.origem)
      ? authorization.data()?.status
      : personData?.consentimentoImagem?.autorizado === true ? 'autorizado' : 'pendente';
    if (!person.exists || !isActiveMemberRecord(personData)) { results.push({ pessoaId, status: 'ignorado', motivo: 'MEMBRO_INDISPONIVEL' }); continue; }
    if (!isVerificationEmail(email)) { results.push({ pessoaId, status: 'ignorado', motivo: 'EMAIL_NAO_CADASTRADO' }); continue; }
    if (effectiveStatus === 'autorizado') { results.push({ pessoaId, status: 'ignorado', motivo: 'JA_AUTORIZADO' }); continue; }
    const token = createImageConsentToken();
    const tokenHash = hashImageConsentToken(token);
    const requestRef = root.collection('solicitacoes_autorizacao_imagem').doc(tokenHash);
    const previousRequests = await root.collection('solicitacoes_autorizacao_imagem').where('pessoaId', '==', pessoaId).limit(20).get();
    const now = Timestamp.now();
    const batch = firestore.batch();
    previousRequests.docs.filter(item => item.data().status === 'pendente').forEach(item => batch.update(item.ref, { status: 'substituida', atualizadoEm: now }));
    batch.create(requestRef, { pessoaId, email, nome: personData.nome || null, status: 'pendente', versaoTermo: IMAGE_CONSENT_VERSION, criadoEm: now, criadoPor: request.auth.uid, expiraEm: Timestamp.fromMillis(now.toMillis() + IMAGE_CONSENT_REQUEST_TTL_MS), envioStatus: 'enviando' });
    batch.create(root.collection('auditoria').doc(), { tipo: 'AUTORIZACAO_IMAGEM_SOLICITADA', pessoaId, pessoaNome: personData.nome || null, executadoPor: request.auth.uid, responsavelNome: executor.data().nome || executor.data().email || null, criadoEm: now });
    await batch.commit();
    try {
      const link = `${getSystemBaseUrl(projectId)}/autorizar-imagem?token=${token}`;
      const communicationId = await deliverTrackedAccountEmail({ root, pessoaBaseId: pessoaId, tipo: 'autorizacao_imagem_solicitacao', email, nome: personData.nome, message: buildImageConsentInvitationEmail({ nome: personData.nome, link }), origemId: requestRef.id });
      await requestRef.update({ envioStatus: 'enviado', comunicacaoId: communicationId, enviadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp() });
      results.push({ pessoaId, status: 'enviado' });
    } catch {
      await requestRef.update({ envioStatus: 'erro', atualizadoEm: FieldValue.serverTimestamp() });
      results.push({ pessoaId, status: 'erro', motivo: 'ENVIO_NAO_CONCLUIDO' });
    }
  }
  return { enviados: results.filter(item => item.status === 'enviado').length, ignorados: results.filter(item => item.status === 'ignorado').length, erros: results.filter(item => item.status === 'erro').length, resultados: results };
});

export const getImageConsentRequest = onCall({ region: 'southamerica-east1', maxInstances: 5 }, async request => {
  fail('failed-precondition', 'FLUXO_EMAIL_AUTORIZACAO_DESATIVADO');
  const token = String(request.data?.token || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) return { status: 'indisponivel' };
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const root = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data');
  const snapshot = await root.collection('solicitacoes_autorizacao_imagem').doc(hashImageConsentToken(token)).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.status !== 'pendente' || data?.expiraEm?.toMillis?.() <= Date.now()) return { status: 'indisponivel' };
  return { status: 'pendente', nome: String(data.nome || '').trim().split(/\s+/)[0] || 'Membro', emailMascarado: maskImageConsentEmail(data.email), versaoTermo: data.versaoTermo || IMAGE_CONSENT_VERSION, codigoEnviado: data.codigoStatus === 'enviado' && data.codigoExpiraEm?.toMillis?.() > Date.now() };
});

export const requestImageConsentCode = onCall(mailjetCallableOptions, async request => {
  fail('failed-precondition', 'FLUXO_EMAIL_AUTORIZACAO_DESATIVADO');
  const token = String(request.data?.token || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) fail('invalid-argument', 'SOLICITACAO_INVALIDA');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const root = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data');
  const requestRef = root.collection('solicitacoes_autorizacao_imagem').doc(hashImageConsentToken(token));
  const code = createVerificationCode();
  const now = Timestamp.now();
  const allowed = await getFirestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(requestRef);
    const data = snapshot.data();
    if (!snapshot.exists || data.status !== 'pendente' || data.expiraEm?.toMillis?.() <= now.toMillis()) fail('failed-precondition', 'SOLICITACAO_INDISPONIVEL');
    if (now.toMillis() - (data.codigoEnviadoEm?.toMillis?.() || 0) < 60000) return null;
    transaction.update(requestRef, { codigoHash: hashVerificationCode({ verificationId: requestRef.id, code }), codigoStatus: 'enviando', codigoTentativas: 0, codigoEnviadoEm: now, codigoExpiraEm: Timestamp.fromMillis(now.toMillis() + 600000), atualizadoEm: now });
    return data;
  });
  if (!allowed) fail('resource-exhausted', 'AGUARDE_REENVIO');
  try {
    await sendAccountMessage({ email: allowed.email, nome: allowed.nome, message: buildImageConsentCodeEmail({ nome: allowed.nome, code }) });
    await requestRef.update({ codigoStatus: 'enviado', atualizadoEm: FieldValue.serverTimestamp() });
  } catch (error) {
    await requestRef.update({ codigoStatus: 'erro', atualizadoEm: FieldValue.serverTimestamp() });
    throw error;
  }
  return { sent: true, emailMascarado: maskImageConsentEmail(allowed.email) };
});

export const submitImageConsentDecision = onCall(mailjetCallableOptions, async request => {
  fail('failed-precondition', 'FLUXO_EMAIL_AUTORIZACAO_DESATIVADO');
  const token = String(request.data?.token || '').trim().toLowerCase();
  const code = String(request.data?.code || '').trim();
  const authorized = request.data?.authorized;
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[0-9]{6}$/.test(code) || typeof authorized !== 'boolean') fail('invalid-argument', 'DADOS_INVALIDOS');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const requestRef = root.collection('solicitacoes_autorizacao_imagem').doc(hashImageConsentToken(token));
  const result = await firestore.runTransaction(async transaction => {
    const consentRequest = await transaction.get(requestRef);
    const data = consentRequest.data();
    const now = Timestamp.now();
    if (!consentRequest.exists || data.status !== 'pendente' || data.expiraEm?.toMillis?.() <= now.toMillis() || data.codigoStatus !== 'enviado' || data.codigoExpiraEm?.toMillis?.() <= now.toMillis() || Number(data.codigoTentativas || 0) >= 5) fail('failed-precondition', 'CODIGO_INVALIDO_OU_EXPIRADO');
    if (!verificationCodeMatches({ verificationId: requestRef.id, code, expectedHash: data.codigoHash })) {
      transaction.update(requestRef, { codigoTentativas: FieldValue.increment(1), atualizadoEm: now });
      return null;
    }
    const personRef = root.collection('pessoas').doc(data.pessoaId);
    const authorizationRef = root.collection('autorizacoes_imagem').doc(data.pessoaId);
    const [person, current] = await Promise.all([transaction.get(personRef), transaction.get(authorizationRef)]);
    if (!person.exists || !isActiveMemberRecord(person.data()) || normalizeVerificationEmail(person.data().email) !== normalizeVerificationEmail(data.email)) fail('failed-precondition', 'MEMBRO_INDISPONIVEL');
    const status = authorized ? 'autorizado' : 'nao_autorizado';
    const previousStatus = ['titular_email', 'titular_sistema'].includes(current.data()?.origem) ? current.data()?.status : person.data()?.consentimentoImagem?.autorizado === true ? 'autorizado' : 'pendente';
    const evidenceHash = buildImageConsentEvidenceHash({ pessoaId: data.pessoaId, solicitacaoId: requestRef.id, autorizado: authorized, versaoTermo: IMAGE_CONSENT_VERSION, respondidoEm: now.toDate().toISOString(), email: data.email });
    transaction.update(personRef, { consentimentoImagem: { autorizado: authorized, versao: IMAGE_CONSENT_VERSION, registradoEm: now }, atualizadoEm: now, atualizadoPor: 'titular_email' });
    transaction.set(authorizationRef, { pessoaId: data.pessoaId, status, origem: 'titular_email', versaoTermo: IMAGE_CONSENT_VERSION, emailVerificado: true, evidenciaHash: evidenceHash, solicitacaoId: requestRef.id, observacao: authorized ? 'Autorizado eletronicamente pelo titular.' : 'Não autorizado eletronicamente pelo titular.', responsavelNome: person.data().nome || data.nome || null, atualizadoEm: now, atualizadoPor: 'titular_email', ...(current.exists ? {} : { criadoEm: now, criadoPor: 'titular_email' }) }, { merge: true });
    transaction.update(requestRef, { status: 'respondida', decisao: status, respondidoEm: now, evidenciaHash: evidenceHash, codigoHash: FieldValue.delete(), codigoStatus: 'utilizado', atualizadoEm: now });
    transaction.create(root.collection('auditoria').doc(), { tipo: 'AUTORIZACAO_IMAGEM_ALTERADA', pessoaId: data.pessoaId, pessoaNome: person.data().nome || null, statusAnterior: previousStatus, statusNovo: status, motivo: authorized ? 'Aceite eletrônico realizado pelo titular.' : 'Recusa eletrônica registrada pelo titular.', executadoPor: 'titular_email', responsavelNome: person.data().nome || null, evidenciaHash: evidenceHash, criadoEm: now });
    return { pessoaId: data.pessoaId, nome: person.data().nome || data.nome, email: data.email, status, evidenceHash };
  });
  if (!result) fail('invalid-argument', 'CODIGO_INVALIDO_OU_EXPIRADO');
  let receiptSent = true;
  try {
    await deliverTrackedAccountEmail({ root, pessoaBaseId: result.pessoaId, tipo: 'autorizacao_imagem_comprovante', email: result.email, nome: result.nome, message: buildImageConsentReceiptEmail({ nome: result.nome, authorized, protocol: result.evidenceHash.slice(0, 16).toUpperCase() }), origemId: requestRef.id });
  } catch { receiptSent = false; }
  return { status: result.status, protocol: result.evidenceHash.slice(0, 16).toUpperCase(), receiptSent };
});

const registerPublicBlock = async ({ root, linkId, identityHash, reason }) => {
  const day = new Date().toISOString().slice(0, 10); const id = `seguranca_${day}_${hashPublicIdentity(`${linkId}|${identityHash}|${reason}`).slice(0, 32)}`;
  await root.collection('auditoria').doc(id).set({ tipo: 'ENVIO_PUBLICO_BLOQUEADO', alvoId: linkId, linkId, motivo: reason, identidadeHash: identityHash, quantidade: FieldValue.increment(1), ultimaOcorrenciaEm: FieldValue.serverTimestamp(), executadoPor: 'sistema', criadoEm: FieldValue.serverTimestamp() }, { merge: true });
};

export const submitReusableRegistrationSecure = onCall({ region: 'southamerica-east1', maxInstances: 5 }, async request => {
  const linkId = String(request.data?.linkId || '').trim(); const data = request.data?.data || {};
  if (!/^[a-f0-9]{64}$/.test(linkId)) fail('invalid-argument', 'SOLICITACAO_INVALIDA');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore(); const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const originHash = hashPublicIdentity(`${linkId}|${request.rawRequest?.ip || 'origem-desconhecida'}`);
  if (String(request.data?.website || '').trim() || Date.now() - Number(request.data?.formStartedAt || 0) < 2000) {
    await registerPublicBlock({ root, linkId, identityHash: originHash, reason: 'AUTOMACAO_DETECTADA' });
    fail('resource-exhausted', 'ENVIO_BLOQUEADO');
  }
  const linkRef = root.collection('links_autocadastro').doc(linkId); const initialLink = await linkRef.get();
  if (!initialLink.exists) fail('failed-precondition', 'LINK_INDISPONIVEL');
  let payload;
  try { payload = buildSecureRegistrationPayload({ linkId, link: initialLink.data(), data }); }
  catch (error) { fail('invalid-argument', String(error?.message || 'SOLICITACAO_INVALIDA')); }
  const requestRef = root.collection('solicitacoes_cadastro').doc(); const nowMillis = Date.now();
  const originRateRef = root.collection('limites_envio_publico').doc(`origem_${originHash}`);
  const cpfHash = hashPublicIdentity(`${linkId}|${payload.cpf}`); const cpfRateRef = root.collection('limites_envio_publico').doc(`cpf_${cpfHash}`);
  const verificationRef = payload.verificacaoEmailId ? root.collection('verificacoes_email_cadastro').doc(payload.verificacaoEmailId) : null;
  try {
    await firestore.runTransaction(async transaction => {
      const snapshots = await Promise.all([transaction.get(linkRef), transaction.get(originRateRef), transaction.get(cpfRateRef), ...(verificationRef ? [transaction.get(verificationRef)] : [])]);
      const [link, originRate, cpfRate, verification] = snapshots; const linkData = link.data();
      if (!link.exists || linkData.status !== 'ativo' || linkData.tipoCadastro !== payload.tipoCadastro || linkData.expiraEm?.toMillis?.() <= nowMillis || (linkData.limiteUsos && Number(linkData.totalUsos || 0) >= linkData.limiteUsos)) fail('failed-precondition', 'LINK_INDISPONIVEL');
      const originStart = originRate.data()?.janelaInicio?.toMillis?.() || 0; const cpfStart = cpfRate.data()?.janelaInicio?.toMillis?.() || 0;
      if (isRateLimitExceeded({ count: Number(originRate.data()?.quantidade || 0), windowStartedAt: originStart, now: nowMillis, windowMs: 3600000, maximum: 5 })) fail('resource-exhausted', 'LIMITE_ORIGEM');
      if (isRateLimitExceeded({ count: Number(cpfRate.data()?.quantidade || 0), windowStartedAt: cpfStart, now: nowMillis, windowMs: 86400000, maximum: 3 })) fail('resource-exhausted', 'LIMITE_IDENTIDADE');
      if (verificationRef && (!verification?.exists || verification.data().status !== 'confirmado' || verification.data().linkId !== linkId || verification.data().email !== payload.email || verification.data().expiraEm?.toMillis?.() <= nowMillis)) fail('failed-precondition', 'EMAIL_NAO_CONFIRMADO');
      const now = Timestamp.fromMillis(nowMillis); const rateValue = (snapshot, start, windowMs) => nowMillis - start >= windowMs ? { janelaInicio: now, quantidade: 1, atualizadoEm: now } : { janelaInicio: snapshot.data()?.janelaInicio || now, quantidade: FieldValue.increment(1), atualizadoEm: now };
      transaction.set(originRateRef, rateValue(originRate, originStart, 3600000), { merge: true }); transaction.set(cpfRateRef, rateValue(cpfRate, cpfStart, 86400000), { merge: true });
      transaction.set(requestRef, { ...payload, ...(payload.consentimentoImagem ? { consentimentoImagem: { ...payload.consentimentoImagem, registradoEm: now } } : {}), aceite: { ...payload.aceite, aceitoEm: now, protocolo: requestRef.id }, enviadoEm: now, atualizadoEm: now });
      transaction.update(linkRef, { totalUsos: Number(linkData.totalUsos || 0) + 1, ultimaSolicitacaoId: requestRef.id, atualizadoEm: now });
      if (verificationRef) transaction.update(verificationRef, { status: 'usado', solicitacaoId: requestRef.id, usadoEm: now, atualizadoEm: now });
    });
  } catch (error) {
    if (error instanceof HttpsError && error.code === 'resource-exhausted') await registerPublicBlock({ root, linkId, identityHash: error.message === 'LIMITE_IDENTIDADE' ? cpfHash : originHash, reason: error.message });
    throw error;
  }
  return { id: requestRef.id };
});

export const requestRegistrationEmailCode = onCall(mailjetCallableOptions, async request => {
  const linkId = String(request.data?.linkId || '').trim();
  const email = normalizeVerificationEmail(request.data?.email);
  if (!/^[a-f0-9]{64}$/.test(linkId) || !isVerificationEmail(email)) fail('invalid-argument', 'DADOS_INVALIDOS');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const root = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data');
  const link = await root.collection('links_autocadastro').doc(linkId).get();
  const linkData = link.data();
  if (!link.exists || linkData.status !== 'ativo' || linkData.tipoCadastro !== 'membro' || linkData.expiraEm?.toMillis?.() <= Date.now() || (linkData.limiteUsos && Number(linkData.totalUsos || 0) >= linkData.limiteUsos)) fail('failed-precondition', 'LINK_INDISPONIVEL');
  const verificationRef = root.collection('verificacoes_email_cadastro').doc();
  const rateRef = root.collection('limites_verificacao_cadastro').doc(hashVerificationIdentity({ linkId, email }));
  const linkRateRef = root.collection('limites_verificacao_cadastro').doc(`link_${linkId}`);
  const code = createVerificationCode();
  const nowMillis = Date.now();
  await getFirestore().runTransaction(async transaction => {
    const [rate, linkRate] = await Promise.all([transaction.get(rateRef), transaction.get(linkRateRef)]);
    if (nowMillis - (rate.data()?.enviadoEm?.toMillis?.() || 0) < 60000) fail('resource-exhausted', 'AGUARDE_REENVIO');
    if (nowMillis - (linkRate.data()?.enviadoEm?.toMillis?.() || 0) < 10000) fail('resource-exhausted', 'AGUARDE_REENVIO');
    transaction.set(rateRef, { enviadoEm: Timestamp.fromMillis(nowMillis) });
    transaction.set(linkRateRef, { enviadoEm: Timestamp.fromMillis(nowMillis) });
    transaction.set(verificationRef, { linkId, email, codigoHash: hashVerificationCode({ verificationId: verificationRef.id, code }), status: 'pendente', tentativas: 0, criadoEm: Timestamp.fromMillis(nowMillis), expiraEm: Timestamp.fromMillis(nowMillis + 600000) });
  });
  try {
    await sendAccountMessage({ email, nome: 'Membro', message: buildRegistrationVerificationEmail(code) });
  } catch (error) {
    await verificationRef.update({ status: 'erro', atualizadoEm: FieldValue.serverTimestamp() });
    throw error;
  }
  return { verificationId: verificationRef.id };
});

export const confirmRegistrationEmailCode = onCall({ region: 'southamerica-east1', maxInstances: 3 }, async request => {
  const verificationId = String(request.data?.verificationId || '').trim();
  const code = String(request.data?.code || '').trim();
  if (!/^[A-Za-z0-9]{20}$/.test(verificationId) || !/^[0-9]{6}$/.test(code)) fail('invalid-argument', 'CODIGO_INVALIDO');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const ref = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data').collection('verificacoes_email_cadastro').doc(verificationId);
  const confirmed = await getFirestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!snapshot.exists || data.status !== 'pendente' || data.expiraEm?.toMillis?.() <= Date.now() || Number(data.tentativas || 0) >= 5) fail('failed-precondition', 'CODIGO_INVALIDO_OU_EXPIRADO');
    const matches = verificationCodeMatches({ verificationId, code, expectedHash: data.codigoHash });
    transaction.update(ref, matches
      ? { status: 'confirmado', confirmadoEm: FieldValue.serverTimestamp(), codigoHash: FieldValue.delete(), atualizadoEm: FieldValue.serverTimestamp() }
      : { tentativas: FieldValue.increment(1), atualizadoEm: FieldValue.serverTimestamp() });
    return matches;
  });
  if (!confirmed) fail('invalid-argument', 'CODIGO_INVALIDO_OU_EXPIRADO');
  return { confirmed: true };
});

export const sendAccessActivationMailjet = onCall(mailjetCallableOptions, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const pessoaBaseId = String(request.data?.pessoaBaseId || '').trim();
  if (!pessoaBaseId) fail('invalid-argument', 'PESSOA_INVALIDA');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const root = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data');
  const [executor, authorization, person] = await Promise.all([root.collection('usuarios').doc(request.auth.uid).get(), root.collection('autorizacoes_acesso').doc(pessoaBaseId).get(), root.collection('pessoas').doc(pessoaBaseId).get()]);
  if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
  if (!authorization.exists || authorization.data().status !== 'pendente' || !person.exists) fail('failed-precondition', 'AUTORIZACAO_NAO_PENDENTE');
  const email = String(authorization.data().email || '').trim().toLowerCase();
  if (email !== String(person.data().email || '').trim().toLowerCase()) fail('failed-precondition', 'AUTORIZACAO_INCONSISTENTE');
  const baseUrl = getSystemBaseUrl(projectId);
  const link = await getAuth().generateSignInWithEmailLink(email, { url: `${baseUrl}/ativar-acesso`, handleCodeInApp: true });
  await deliverTrackedAccountEmail({ root, pessoaBaseId, tipo: 'ativacao_acesso', email, nome: person.data().nome, message: buildActivationEmail({ nome: person.data().nome, link }) });
  return { sent: true };
});

export const sendEmailVerificationMailjet = onCall(mailjetCallableOptions, async request => {
  if (!request.auth?.token?.email) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  if (request.auth.token.email_verified === true) return { sent: false, alreadyVerified: true };
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const user = await getAuth().getUser(request.auth.uid);
  const root = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data');
  const profile = await root.collection('usuarios').doc(request.auth.uid).get();
  const link = await getAuth().generateEmailVerificationLink(user.email, { url: getSystemBaseUrl(projectId) });
  await deliverTrackedAccountEmail({ root, pessoaBaseId: profile.data()?.pessoaBaseId || request.auth.uid, tipo: 'validacao_email', email: user.email, nome: profile.data()?.nome || user.displayName, message: buildVerificationEmail({ nome: profile.data()?.nome || user.displayName, link }) });
  return { sent: true };
});

export const sendPasswordResetMailjet = onCall(mailjetCallableOptions, async request => {
  const email = String(request.data?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { accepted: true };
  try {
    const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
    const user = await getAuth().getUserByEmail(email);
    const root = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data');
    const limitRef = root.collection('email_recuperacao_limites').doc(user.uid);
    const allowed = await getFirestore().runTransaction(async transaction => {
      const snapshot = await transaction.get(limitRef);
      const last = snapshot.data()?.enviadoEm?.toMillis?.() || 0;
      if (Date.now() - last < 60000) return false;
      transaction.set(limitRef, { enviadoEm: FieldValue.serverTimestamp() });
      return true;
    });
    if (allowed) {
      const profile = await root.collection('usuarios').doc(user.uid).get();
      const link = await getAuth().generatePasswordResetLink(email, { url: getSystemBaseUrl(projectId) });
      await deliverTrackedAccountEmail({ root, pessoaBaseId: profile.data()?.pessoaBaseId || user.uid, tipo: 'recuperacao_senha', email, nome: profile.data()?.nome || user.displayName, message: buildPasswordResetEmail({ nome: profile.data()?.nome || user.displayName, link }) });
    }
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') console.error('password reset email failed', { code: error?.code || error?.message });
  }
  return { accepted: true };
});

export const resendEmailCommunicationMailjet = onCall(mailjetCallableOptions, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const communicationId = String(request.data?.communicationId || '').trim();
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const root = getFirestore().collection('artifacts').doc(projectId).collection('public').doc('data');
  const [executor, communication] = await Promise.all([root.collection('usuarios').doc(request.auth.uid).get(), root.collection('comunicacoes_email').doc(communicationId).get()]);
  if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
  if (!communication.exists || communication.data().status !== 'erro') fail('failed-precondition', 'REENVIO_NAO_PERMITIDO');
  const previous = communication.data();
  const person = await root.collection('pessoas').doc(previous.pessoaBaseId).get();
  if (!person.exists || person.data().ativo === false) fail('failed-precondition', 'PESSOA_INDISPONIVEL');
  const email = String(person.data().email || '').trim().toLowerCase();
  let message;
  if (previous.tipo === 'cadastro_aprovado') message = buildApprovedRegistrationEmail(person.data());
  else {
    const users = await root.collection('usuarios').where('pessoaBaseId', '==', previous.pessoaBaseId).limit(1).get();
    const linkedUser = users.docs[0];
    if (previous.tipo === 'ativacao_acesso') {
      const authorization = await root.collection('autorizacoes_acesso').doc(previous.pessoaBaseId).get();
      if (!authorization.exists || authorization.data().status !== 'pendente') fail('failed-precondition', 'REENVIO_NAO_PERMITIDO');
      const link = await getAuth().generateSignInWithEmailLink(email, { url: `${getSystemBaseUrl(projectId)}/ativar-acesso`, handleCodeInApp: true });
      message = buildActivationEmail({ nome: person.data().nome, link });
    } else if (previous.tipo === 'validacao_email' && linkedUser) {
      const authUser = await getAuth().getUser(linkedUser.id);
      if (authUser.emailVerified) fail('failed-precondition', 'REENVIO_NAO_PERMITIDO');
      message = buildVerificationEmail({ nome: person.data().nome, link: await getAuth().generateEmailVerificationLink(email, { url: getSystemBaseUrl(projectId) }) });
    } else if (previous.tipo === 'recuperacao_senha' && linkedUser) {
      message = buildPasswordResetEmail({ nome: person.data().nome, link: await getAuth().generatePasswordResetLink(email, { url: getSystemBaseUrl(projectId) }) });
    } else if (previous.tipo === 'autorizacao_imagem_comprovante') {
      const authorization = await root.collection('autorizacoes_imagem').doc(previous.pessoaBaseId).get();
      if (!authorization.exists || !['titular_email', 'titular_sistema'].includes(authorization.data().origem)) fail('failed-precondition', 'REENVIO_NAO_PERMITIDO');
      message = buildImageConsentReceiptEmail({ nome: person.data().nome, authorized: authorization.data().status === 'autorizado', protocol: String(authorization.data().evidenciaHash || authorization.id).slice(0, 16).toUpperCase() });
    } else fail('failed-precondition', 'REENVIO_NAO_PERMITIDO');
  }
  const id = await deliverTrackedAccountEmail({ root, pessoaBaseId: previous.pessoaBaseId, tipo: previous.tipo, email, nome: person.data().nome, message, reenviadoDe: communicationId });
  return { sent: true, communicationId: id };
});

export const createAccessAuthorizationSecure = onCall({ maxInstances: 3 }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const pessoaBaseId = String(request.data?.pessoaBaseId || '').trim();
  const role = String(request.data?.role || '').trim();
  if (!pessoaBaseId || !accessRoles.has(role)) fail('invalid-argument', 'AUTORIZACAO_INVALIDA');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  if (!projectId) fail('internal', 'PROJETO_FIREBASE_NAO_IDENTIFICADO');
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const personRef = root.collection('pessoas').doc(pessoaBaseId);
  const indexRef = root.collection('usuario_pessoa_index').doc(pessoaBaseId);
  const authorizationRef = root.collection('autorizacoes_acesso').doc(pessoaBaseId);
  const auditRef = root.collection('auditoria').doc();
  try {
    return await firestore.runTransaction(async transaction => {
      const [executor, personSnapshot, indexSnapshot, authorizationSnapshot, peopleSnapshot] = await Promise.all([
        transaction.get(root.collection('usuarios').doc(request.auth.uid)),
        transaction.get(personRef),
        transaction.get(indexRef),
        transaction.get(authorizationRef),
        transaction.get(root.collection('pessoas')),
      ]);
      if (!executor.exists || !isActiveAdmin(executor.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
      const person = personSnapshot.exists ? personSnapshot.data() : null;
      const email = normalizeIdentityEmail(person?.email);
      const activeEmailMatchIds = peopleSnapshot.docs
        .filter(snapshot => isActiveMemberRecord(snapshot.data()) && normalizeIdentityEmail(snapshot.data().email) === email)
        .map(snapshot => snapshot.id);
      try {
        validateAccessAuthorizationCreation({
          personId: pessoaBaseId,
          person,
          role,
          index: indexSnapshot.exists ? indexSnapshot.data() : null,
          authorization: authorizationSnapshot.exists ? authorizationSnapshot.data() : null,
          activeEmailMatchIds,
        });
      } catch (error) {
        fail('failed-precondition', error.message);
      }
      const now = FieldValue.serverTimestamp();
      const authorization = {
        pessoaBaseId,
        email,
        role,
        status: 'pendente',
        criadoEm: now,
        criadoPor: request.auth.uid,
        atualizadoEm: now,
        atualizadoPor: request.auth.uid,
        auditoriaPreautorizacaoId: auditRef.id,
      };
      transaction.set(authorizationRef, authorization);
      transaction.set(auditRef, { tipo: 'USUARIO_ACESSO_PREAUTORIZADO', pessoaBaseId, email, role, executadoPor: request.auth.uid, criadoEm: now });
      return { pessoaBaseId, email, role };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('createAccessAuthorizationSecure failed', { name: error.name, code: error.code, message: error.message });
    throw error;
  }
});

export const savePersonWithUniqueEmail = onCall({ maxInstances: 3 }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const pessoaId = String(request.data?.pessoaId || '').trim() || null;
  const payload = cleanPersonPayload(request.data?.data);
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  if (!projectId) fail('internal', 'PROJETO_FIREBASE_NAO_IDENTIFICADO');
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const personRef = pessoaId ? root.collection('pessoas').doc(pessoaId) : root.collection('pessoas').doc();
  try {
    return await firestore.runTransaction(async transaction => {
      const reads = [transaction.get(root.collection('usuarios').doc(request.auth.uid)), transaction.get(root.collection('pessoas'))];
      if (pessoaId) reads.push(transaction.get(personRef));
      const [executorSnapshot, peopleSnapshot, targetSnapshot] = await Promise.all(reads);
      const executor = executorSnapshot.data();
      if (!executorSnapshot.exists || executor?.ativo === false || !['admin', 'gestor'].includes(executor?.role)) fail('permission-denied', 'GESTAO_PESSOAS_OBRIGATORIA');
      if (pessoaId && !targetSnapshot?.exists) fail('not-found', 'PESSOA_NAO_ENCONTRADA');
      const current = targetSnapshot?.data() || null;
      const rawNext = {
        ...(current || {}),
        ...payload,
        vinculo: payload.vinculo,
        tipoPessoa: payload.vinculo === 'membro' ? 'Membro' : 'Consulente',
        funcoesCasa: payload.vinculo === 'membro' ? [...new Set(payload.funcoesCasa || [])] : [],
        email: normalizeIdentityEmail(payload.email) || null,
        cpf: String(payload.cpf || '').replace(/\D/g, '') || null,
        ativo: current ? current.ativo !== false : true,
      };
      const next = normalizeCollectionData('pessoas', rawNext);
      try { validateSecurePersonPayload(next); }
      catch (error) { fail('invalid-argument', error.message); }
      const people = peopleSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
      const nextEmailIndexId = getActiveMemberEmailIndexId(next);
      const previousEmailIndexId = getActiveMemberEmailIndexId(current);
      const nextEmailIndexRef = nextEmailIndexId ? root.collection('membro_email_index').doc(nextEmailIndexId) : null;
      const previousEmailIndexRef = previousEmailIndexId ? root.collection('membro_email_index').doc(previousEmailIndexId) : null;
      const nextCpfRef = next.cpf ? root.collection('cpf_index').doc(next.cpf) : null;
      const previousCpf = String(current?.cpf || '').replace(/\D/g, '') || null;
      const previousCpfRef = previousCpf ? root.collection('cpf_index').doc(previousCpf) : null;
      const refs = [...new Map([nextEmailIndexRef, previousEmailIndexRef, nextCpfRef, previousCpfRef].filter(Boolean).map(ref => [ref.path, ref])).values()];
      const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
      const byPath = new Map(snapshots.map(snapshot => [snapshot.ref.path, snapshot]));
      const nextEmailIndex = nextEmailIndexRef ? byPath.get(nextEmailIndexRef.path) : null;
      try {
        assertMemberEmailAvailable({ personId: personRef.id, person: next, people, index: nextEmailIndex?.exists ? nextEmailIndex.data() : null });
      } catch (error) {
        throw new HttpsError('already-exists', error.message, { existingPersonName: error.existingPersonName || null });
      }
      const nextCpfSnapshot = nextCpfRef ? byPath.get(nextCpfRef.path) : null;
      if (nextCpfSnapshot?.exists && nextCpfSnapshot.data().pessoaId !== personRef.id) fail('already-exists', 'CPF_DUPLICADO');
      const now = FieldValue.serverTimestamp();
      const changedFields = current
        ? Object.keys(payload).filter(key => JSON.stringify(current[key] ?? null) !== JSON.stringify(next[key] ?? null))
        : Object.keys(payload).filter(key => key !== 'busca');
      const auditRef = root.collection('auditoria').doc();
      if (previousEmailIndexRef && (!nextEmailIndexRef || previousEmailIndexRef.path !== nextEmailIndexRef.path)) {
        const oldIndex = byPath.get(previousEmailIndexRef.path);
        if (oldIndex?.exists && oldIndex.data().pessoaId === personRef.id) transaction.delete(previousEmailIndexRef);
      }
      if (previousCpfRef && (!nextCpfRef || previousCpfRef.path !== nextCpfRef.path)) {
        const oldIndex = byPath.get(previousCpfRef.path);
        if (oldIndex?.exists && oldIndex.data().pessoaId === personRef.id) transaction.delete(previousCpfRef);
      }
      if (nextEmailIndexRef) transaction.set(nextEmailIndexRef, { email: next.email, pessoaId: personRef.id, atualizadoEm: now }, { merge: true });
      if (nextCpfRef && !nextCpfSnapshot?.exists) transaction.set(nextCpfRef, { pessoaId: personRef.id, criadoEm: now });
      if (current) transaction.update(personRef, { ...payload, vinculo: next.vinculo, tipoPessoa: next.tipoPessoa, funcoesCasa: next.funcoesCasa, email: next.email, cpf: next.cpf, atualizadoEm: now, atualizadoPor: request.auth.uid });
      else transaction.set(personRef, { ...payload, vinculo: next.vinculo, tipoPessoa: next.tipoPessoa, funcoesCasa: next.funcoesCasa, email: next.email, cpf: next.cpf, ativo: true, criadoEm: now, criadoPor: request.auth.uid, atualizadoEm: now, atualizadoPor: request.auth.uid });
      transaction.set(auditRef, { tipo: current ? 'PESSOA_ATUALIZADA' : 'PESSOA_CRIADA', pessoaBaseId: personRef.id, camposAlterados: changedFields, executadoPor: request.auth.uid, criadoEm: now });
      return { pessoaId: personRef.id, created: !current };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('savePersonWithUniqueEmail failed', { name: error.name, code: error.code, message: error.message });
    throw error;
  }
});

export const updateMemberLifecycleSecure = onCall({ maxInstances: 3 }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const pessoaBaseId = String(request.data?.pessoaBaseId || '').trim();
  const active = request.data?.active;
  const reason = String(request.data?.reason || '').trim();
  if (!pessoaBaseId || typeof active !== 'boolean') fail('invalid-argument', 'LIFECYCLE_INVALIDO');
  if (!active && !reason) fail('invalid-argument', 'MOTIVO_OBRIGATORIO');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const personRef = root.collection('pessoas').doc(pessoaBaseId);
  const auditRef = root.collection('auditoria').doc();
  try {
    return await firestore.runTransaction(async transaction => {
      const [executorSnapshot, personSnapshot, peopleSnapshot] = await Promise.all([
        transaction.get(root.collection('usuarios').doc(request.auth.uid)), transaction.get(personRef), transaction.get(root.collection('pessoas')),
      ]);
      const executor = executorSnapshot.data();
      if (!executorSnapshot.exists || !isActiveAdmin(executor)) fail('permission-denied', 'ADMIN_OBRIGATORIO');
      if (executor.pessoaBaseId === pessoaBaseId) fail('failed-precondition', 'AUTO_INATIVACAO_PROIBIDA');
      if (!personSnapshot.exists) fail('not-found', 'PESSOA_NAO_ENCONTRADA');
      const person = personSnapshot.data();
      if ((person.ativo !== false) === active) fail('failed-precondition', 'SITUACAO_JA_APLICADA');
      const next = { ...person, ativo: active };
      const emailIndexRef = String(person.vinculo || person.tipoPessoa || '').toLowerCase().includes('membro') && person.email
        ? root.collection('membro_email_index').doc(getMemberEmailIndexId(person.email)) : null;
      const emailIndexSnapshot = emailIndexRef ? await transaction.get(emailIndexRef) : null;
      if (active) {
        try {
          assertMemberEmailAvailable({ personId: pessoaBaseId, person: next, people: peopleSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() })), index: emailIndexSnapshot?.exists ? emailIndexSnapshot.data() : null });
        } catch (error) {
          throw new HttpsError('already-exists', error.message, { existingPersonName: error.existingPersonName || null });
        }
      }
      const now = FieldValue.serverTimestamp();
      if (emailIndexRef && active) transaction.set(emailIndexRef, { email: normalizeIdentityEmail(person.email), pessoaId: pessoaBaseId, atualizadoEm: now }, { merge: true });
      if (emailIndexRef && !active && emailIndexSnapshot?.exists && emailIndexSnapshot.data().pessoaId === pessoaBaseId) transaction.delete(emailIndexRef);
      transaction.update(personRef, {
        ativo: active,
        ...(active ? { reativadoEm: now, reativadoPor: request.auth.uid } : { inativadoEm: now, inativadoPor: request.auth.uid, motivoInativacao: reason }),
        auditoriaLifecycleId: auditRef.id,
        atualizadoEm: now,
        atualizadoPor: request.auth.uid,
      });
      transaction.set(auditRef, { tipo: active ? 'MEMBRO_REATIVADO' : 'MEMBRO_INATIVADO', pessoaBaseId, ...(reason ? { motivo: reason } : {}), executadoPor: request.auth.uid, criadoEm: now });
      return { updated: true };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('updateMemberLifecycleSecure failed', { name: error.name, code: error.code, message: error.message });
    throw error;
  }
});

export const rebuildMemberEmailIndexSecure = onCall({ maxInstances: 3 }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const pessoaBaseId = String(request.data?.pessoaBaseId || '').trim();
  if (!pessoaBaseId) fail('invalid-argument', 'PESSOA_INVALIDA');
  const projectId = resolveProjectId({ appProjectId: getApp().options.projectId, googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT, gcloudProject: process.env.GCLOUD_PROJECT });
  if (!projectId) fail('internal', 'PROJETO_FIREBASE_NAO_IDENTIFICADO');
  const firestore = getFirestore();
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const personRef = root.collection('pessoas').doc(pessoaBaseId);
  const auditRef = root.collection('auditoria').doc();
  try {
    return await firestore.runTransaction(async transaction => {
      const [executorSnapshot, personSnapshot, peopleSnapshot] = await Promise.all([
        transaction.get(root.collection('usuarios').doc(request.auth.uid)),
        transaction.get(personRef),
        transaction.get(root.collection('pessoas')),
      ]);
      if (!executorSnapshot.exists || !isActiveAdmin(executorSnapshot.data())) fail('permission-denied', 'ADMIN_OBRIGATORIO');
      if (!personSnapshot.exists) fail('not-found', 'PESSOA_NAO_ENCONTRADA');
      const person = personSnapshot.data();
      if (!isActiveMemberIdentity(person)) fail('failed-precondition', 'PESSOA_NAO_E_MEMBRO_ATIVO');
      const indexRef = root.collection('membro_email_index').doc(getMemberEmailIndexId(person.email));
      const indexSnapshot = await transaction.get(indexRef);
      try {
        assertMemberEmailAvailable({
          personId: pessoaBaseId,
          person,
          people: peopleSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() })),
          index: indexSnapshot.exists ? indexSnapshot.data() : null,
        });
      } catch (error) {
        if (error.message === 'EMAIL_MEMBRO_INVALIDO') fail('failed-precondition', error.message);
        throw new HttpsError('already-exists', error.message, { existingPersonName: error.existingPersonName || null });
      }
      if (indexSnapshot.exists) return { updated: false };
      const now = FieldValue.serverTimestamp();
      transaction.set(indexRef, { email: normalizeIdentityEmail(person.email), pessoaId: pessoaBaseId, criadoEm: now, atualizadoEm: now });
      transaction.set(auditRef, { tipo: 'MEMBRO_EMAIL_INDEX_RECONSTRUIDO', pessoaBaseId, executadoPor: request.auth.uid, criadoEm: now });
      return { updated: true };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('rebuildMemberEmailIndexSecure failed', { name: error.name, code: error.code, message: error.message });
    throw error;
  }
});

export const updateUserAccess = onCall({ maxInstances: 3 }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const { targetUid, action, role, active, reason, pessoaBaseId } = request.data || {};
  if (!targetUid || !['role', 'active', 'link', 'authorize'].includes(action)) fail('invalid-argument', 'OPERACAO_INVALIDA');
  if (targetUid === request.auth.uid && action !== 'link') fail('failed-precondition', 'AUTO_ALTERACAO_PROIBIDA');
  if (['role', 'authorize'].includes(action) && !accessRoles.has(role)) fail('invalid-argument', 'ROLE_INVALIDA');
  if (action === 'active' && typeof active !== 'boolean') fail('invalid-argument', 'SITUACAO_INVALIDA');
  if (['link', 'authorize'].includes(action) && !pessoaBaseId) fail('invalid-argument', 'PESSOA_OBRIGATORIA');
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (action === 'active' && active === false && !cleanReason) fail('invalid-argument', 'MOTIVO_OBRIGATORIO');

  const firestore = getFirestore();
  const projectId = resolveProjectId({
    appProjectId: getApp().options.projectId,
    googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT,
    gcloudProject: process.env.GCLOUD_PROJECT
  });
  if (!projectId) fail('internal', 'PROJETO_FIREBASE_NAO_IDENTIFICADO');
  const root = firestore.collection('artifacts').doc(projectId).collection('public').doc('data');
  const users = root.collection('usuarios');
  const executorRef = users.doc(request.auth.uid);
  const targetRef = users.doc(targetUid);
  const auditRef = root.collection('auditoria').doc();

  try {
    return await firestore.runTransaction(async transaction => {
      const [executorSnapshot, targetSnapshot] = await Promise.all([transaction.get(executorRef), transaction.get(targetRef)]);
      const executor = executorSnapshot.data();
      if (!executorSnapshot.exists || !isActiveAdmin(executor)) fail('permission-denied', 'ADMIN_OBRIGATORIO');
      if (!targetSnapshot.exists) fail('not-found', 'USUARIO_NAO_ENCONTRADO');
      const target = targetSnapshot.data();
      if (['link', 'authorize'].includes(action)) {
        if (action === 'authorize' && target.role !== 'pendente') fail('failed-precondition', 'USUARIO_NAO_PENDENTE');
        const currentPessoaBaseId = target.pessoaBaseId || null;
        const [nextPersonSnapshot, nextIndexSnapshot, peopleSnapshot] = await Promise.all([
          transaction.get(root.collection('pessoas').doc(pessoaBaseId)),
          transaction.get(root.collection('usuario_pessoa_index').doc(pessoaBaseId)),
          transaction.get(root.collection('pessoas')),
        ]);
        let currentPersonSnapshot = null;
        let currentIndexSnapshot = null;
        if (currentPessoaBaseId) {
          [currentPersonSnapshot, currentIndexSnapshot] = await Promise.all([
            transaction.get(root.collection('pessoas').doc(currentPessoaBaseId)),
            transaction.get(root.collection('usuario_pessoa_index').doc(currentPessoaBaseId)),
          ]);
        }
        let decision;
        try {
          const nextEmail = normalizeIdentityEmail(nextPersonSnapshot.data()?.email);
          const activeEmailMatchIds = peopleSnapshot.docs
            .filter(snapshot => isActiveMemberRecord(snapshot.data()) && normalizeIdentityEmail(snapshot.data().email) === nextEmail)
            .map(snapshot => snapshot.id);
          decision = validateUserPersonLinkChange({
            targetUid,
            target: action === 'authorize' ? { ...target, role } : target,
            currentPersonExists: currentPersonSnapshot?.exists === true,
            nextPersonId: pessoaBaseId,
            nextPerson: nextPersonSnapshot.exists ? nextPersonSnapshot.data() : null,
            nextIndex: nextIndexSnapshot.exists ? nextIndexSnapshot.data() : null,
            activeEmailMatchIds,
          });
        } catch (error) {
          fail('failed-precondition', error.message);
        }
        if (!decision.updated) return { updated: false };
        if (decision.repaired && currentIndexSnapshot?.exists) {
          if (currentIndexSnapshot.data()?.uid !== targetUid) fail('failed-precondition', 'INDICE_VINCULO_DIVERGENTE');
          transaction.delete(currentIndexSnapshot.ref);
        }
        const now = FieldValue.serverTimestamp();
        if (!nextIndexSnapshot.exists) transaction.set(nextIndexSnapshot.ref, { pessoaBaseId, uid: targetUid, criadoEm: now, criadoPor: request.auth.uid });
        transaction.update(targetRef, {
          pessoaBaseId,
          ...(action === 'authorize' ? { role, ativo: true } : {}),
          atualizadoEm: now,
          atualizadoPor: request.auth.uid,
        });
        transaction.set(auditRef, {
          tipo: action === 'authorize' ? 'USUARIO_AUTORIZADO' : decision.repaired ? 'USUARIO_VINCULO_REPARADO' : 'USUARIO_VINCULADO',
          alvoUid: targetUid,
          pessoaBaseId,
          ...(action === 'authorize' ? { role } : {}),
          ...(decision.previousPessoaBaseId ? { vinculoAnteriorId: decision.previousPessoaBaseId } : {}),
          executadoPor: request.auth.uid,
          criadoEm: now,
        });
        return { updated: true, repaired: decision.repaired, authorized: action === 'authorize' };
      }
      const next = { ...target, ...(action === 'role' ? { role } : { ativo: active }) };
      if (action === 'role' && target.role === role) return { updated: false };
      if (action === 'active' && (target.ativo !== false) === active) return { updated: false };
      if (requiresActiveMember({ action, target, active })) {
        const personSnapshot = await transaction.get(root.collection('pessoas').doc(target.pessoaBaseId));
        if (!personSnapshot.exists || personSnapshot.data()?.ativo === false) fail('failed-precondition', 'MEMBRO_INATIVO');
      }
      if (requiresAdminCount(target, next)) {
        const admins = await transaction.get(users.where('role', '==', 'admin'));
        const activeAdminCount = admins.docs.filter(snapshot => isActiveAdmin(snapshot.data())).length;
        assertAdminContinuity({ target, next, activeAdminCount });
      }
      const now = FieldValue.serverTimestamp();
      if (action === 'role') {
        transaction.update(targetRef, { role, atualizadoEm: now, atualizadoPor: request.auth.uid });
        transaction.set(auditRef, { tipo: 'USUARIO_ROLE_ALTERADO', alvoUid: targetUid, ...(target.pessoaBaseId ? { pessoaBaseId: target.pessoaBaseId } : {}), valorAnterior: target.role, valorNovo: role, executadoPor: request.auth.uid, criadoEm: now });
      } else {
        transaction.update(targetRef, active
          ? { ativo: true, acessoReativadoEm: now, acessoReativadoPor: request.auth.uid, atualizadoEm: now, atualizadoPor: request.auth.uid }
          : { ativo: false, acessoRevogadoEm: now, acessoRevogadoPor: request.auth.uid, motivoRevogacao: cleanReason, atualizadoEm: now, atualizadoPor: request.auth.uid });
        transaction.set(auditRef, { tipo: active ? 'USUARIO_ACESSO_REATIVADO' : 'USUARIO_ACESSO_REVOGADO', alvoUid: targetUid, ...(target.pessoaBaseId ? { pessoaBaseId: target.pessoaBaseId } : {}), ...(cleanReason ? { motivo: cleanReason } : {}), executadoPor: request.auth.uid, criadoEm: now });
      }
      return { updated: true };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error.message === 'ULTIMO_ADMINISTRADOR') fail('failed-precondition', error.message);
    console.error('updateUserAccess failed', { name: error.name, code: error.code, message: error.message });
    throw error;
  }
});
