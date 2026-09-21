import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import process from 'node:process';
import { assertAdminContinuity, isActiveAdmin, requiresActiveMember, requiresAdminCount, resolveProjectId, validateAccessAuthorizationCreation, validateUserPersonLinkChange } from './adminPolicy.js';
import { buildApprovedRegistrationEmail, sendMailjetEmail, sendMailjetMessage, shouldSendApprovedRegistrationEmail } from './registrationEmail.js';
import { buildActivationEmail, buildPasswordResetEmail, buildVerificationEmail, getSystemBaseUrl } from './accountEmail.js';
import { buildRegistrationEvidenceHash, buildRegistrationVerificationEmail, createVerificationCode, hashVerificationCode, hashVerificationIdentity, isVerificationEmail, normalizeVerificationEmail, verificationCodeMatches } from './registrationVerification.js';
import { assertMemberEmailAvailable, getMemberEmailIndexId, isActiveMemberIdentity, validateSecurePersonPayload } from './personIdentity.js';

if (!getApps().length) initializeApp();

const allowedRoles = new Set(['admin', 'gestor', 'atendimento']);
const fail = (code, message) => { throw new HttpsError(code, message); };
const normalizeIdentityEmail = value => String(value || '').trim().toLowerCase();
const isActiveMemberRecord = person => person?.ativo !== false && String(person?.vinculo || person?.tipoPessoa || '').trim().toLowerCase() === 'membro';
const PERSON_EDITABLE_FIELDS = new Set(['vinculo', 'funcoesCasa', 'tipoPessoa', 'nome', 'dataNascimento', 'cpf', 'contato', 'email', 'responsavelCpf', 'responsavelNome', 'responsavelContato', 'sexo', 'estadoCivil', 'endereco', 'dadosCasa', 'statusCadastro', 'origemCadastro', 'busca']);
const cleanPersonPayload = data => Object.fromEntries(Object.entries(data || {}).filter(([key, value]) => PERSON_EDITABLE_FIELDS.has(key) && value !== undefined));
const mailjetApiKey = defineSecret('MAILJET_API_KEY');
const mailjetSecretKey = defineSecret('MAILJET_SECRET_KEY');
const registrationEmailFrom = defineSecret('REGISTRATION_EMAIL_FROM');
const AUDIT_RETENTION_MONTHS = 24;

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
const deliverTrackedAccountEmail = async ({ root, pessoaBaseId, tipo, email, nome, message, reenviadoDe = null }) => {
  const ref = root.collection('comunicacoes_email').doc();
  await ref.set({ pessoaBaseId, tipo, destinatario: email, nome: nome || null, status: 'enviando', ...(reenviadoDe ? { reenviadoDe } : {}), criadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp() });
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
    } else fail('failed-precondition', 'REENVIO_NAO_PERMITIDO');
  }
  const id = await deliverTrackedAccountEmail({ root, pessoaBaseId: previous.pessoaBaseId, tipo: previous.tipo, email, nome: person.data().nome, message, reenviadoDe: communicationId });
  return { sent: true, communicationId: id };
});

export const createAccessAuthorizationSecure = onCall({ maxInstances: 3 }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const pessoaBaseId = String(request.data?.pessoaBaseId || '').trim();
  const role = String(request.data?.role || '').trim();
  if (!pessoaBaseId || !allowedRoles.has(role)) fail('invalid-argument', 'AUTORIZACAO_INVALIDA');
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
      const next = {
        ...(current || {}),
        ...payload,
        vinculo: payload.vinculo,
        tipoPessoa: payload.vinculo === 'membro' ? 'Membro' : 'Consulente',
        funcoesCasa: payload.vinculo === 'membro' ? [...new Set(payload.funcoesCasa || [])] : [],
        email: normalizeIdentityEmail(payload.email) || null,
        cpf: String(payload.cpf || '').replace(/\D/g, '') || null,
        ativo: current ? current.ativo !== false : true,
      };
      try { validateSecurePersonPayload(next); }
      catch (error) { fail('invalid-argument', error.message); }
      const people = peopleSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
      const nextEmailIndexRef = isActiveMemberIdentity(next) ? root.collection('membro_email_index').doc(getMemberEmailIndexId(next.email)) : null;
      const previousEmailIndexRef = isActiveMemberIdentity(current) ? root.collection('membro_email_index').doc(getMemberEmailIndexId(current.email)) : null;
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
  if (['role', 'authorize'].includes(action) && !allowedRoles.has(role)) fail('invalid-argument', 'ROLE_INVALIDA');
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
