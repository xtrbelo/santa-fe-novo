import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import process from 'node:process';
import { assertAdminContinuity, isActiveAdmin, requiresActiveMember, requiresAdminCount, resolveProjectId } from './adminPolicy.js';
import { buildApprovedRegistrationEmail, sendMailjetEmail, sendMailjetMessage, shouldSendApprovedRegistrationEmail } from './registrationEmail.js';
import { buildActivationEmail, buildPasswordResetEmail, buildVerificationEmail, getSystemBaseUrl } from './accountEmail.js';
import { buildRegistrationEvidenceHash, buildRegistrationVerificationEmail, createVerificationCode, hashVerificationCode, hashVerificationIdentity, isVerificationEmail, normalizeVerificationEmail, verificationCodeMatches } from './registrationVerification.js';

if (!getApps().length) initializeApp();

const allowedRoles = new Set(['admin', 'gestor', 'atendimento']);
const fail = (code, message) => { throw new HttpsError(code, message); };
const mailjetApiKey = defineSecret('MAILJET_API_KEY');
const mailjetSecretKey = defineSecret('MAILJET_SECRET_KEY');
const registrationEmailFrom = defineSecret('REGISTRATION_EMAIL_FROM');

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

export const updateUserAccess = onCall({ maxInstances: 3 }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) fail('unauthenticated', 'AUTENTICACAO_OBRIGATORIA');
  const { targetUid, action, role, active, reason } = request.data || {};
  if (!targetUid || !['role', 'active'].includes(action)) fail('invalid-argument', 'OPERACAO_INVALIDA');
  if (targetUid === request.auth.uid) fail('failed-precondition', 'AUTO_ALTERACAO_PROIBIDA');
  if (action === 'role' && !allowedRoles.has(role)) fail('invalid-argument', 'ROLE_INVALIDA');
  if (action === 'active' && typeof active !== 'boolean') fail('invalid-argument', 'SITUACAO_INVALIDA');
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
        transaction.set(auditRef, { tipo: 'USUARIO_ROLE_ALTERADO', alvoUid: targetUid, valorAnterior: target.role, valorNovo: role, executadoPor: request.auth.uid, criadoEm: now });
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
