import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import process from 'node:process';
import { assertAdminContinuity, isActiveAdmin, requiresActiveMember, requiresAdminCount, resolveProjectId } from './adminPolicy.js';

if (!getApps().length) initializeApp();

const allowedRoles = new Set(['admin', 'gestor', 'atendimento']);
const fail = (code, message) => { throw new HttpsError(code, message); };

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
