import assert from 'node:assert/strict';
import process from 'node:process';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { cancelarAgenda, excluirAgendaVazia } from '../src/services/firebase.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('VALIDAÇÃO BLOQUEADA: Firestore Emulator não está ativo.');
}

const adminUid = process.env.EMULATOR_ADMIN_UID?.trim();
if (!adminUid) throw new Error('VALIDAÇÃO BLOQUEADA: informe EMULATOR_ADMIN_UID.');

const projectId = process.env.GCLOUD_PROJECT || 'santa-fe-v2';
if (projectId !== 'santa-fe-v2') throw new Error(`VALIDAÇÃO BLOQUEADA: projeto inesperado (${projectId}).`);

const root = `artifacts/${projectId}/public/data`;
const environment = await initializeTestEnvironment({ projectId });
const adminDb = environment.authenticatedContext(adminUid).firestore();
const gestorDb = environment.authenticatedContext('gestor-local-teste').firestore();
const agendaRef = (db, id) => doc(db, `${root}/agendas/${id}`);

try {
  await cancelarAgenda({ agendaId: 'agenda-c-cancelamento', userId: adminUid }, adminDb);
  const canceled = (await getDoc(agendaRef(adminDb, 'agenda-c-cancelamento'))).data();
  assert.equal(canceled.status, 'Cancelada');
  assert.equal(canceled.canceladaPor, adminUid);
  assert.ok(canceled.canceladaEm);

  await excluirAgendaVazia({ agendaId: 'agenda-a-vazia', userId: adminUid }, adminDb);
  assert.equal((await getDoc(agendaRef(adminDb, 'agenda-a-vazia'))).exists(), false);

  await assert.rejects(
    excluirAgendaVazia({ agendaId: 'agenda-b-com-historico', userId: adminUid }, adminDb),
    /AGENDA_POSSUI_HISTORICO/
  );
  assert.equal((await getDoc(agendaRef(adminDb, 'agenda-b-com-historico'))).exists(), true);

  await cancelarAgenda({ agendaId: 'agenda-d-gestor', userId: 'gestor-local-teste' }, gestorDb);
  await assert.rejects(
    excluirAgendaVazia({ agendaId: 'agenda-d-gestor', userId: 'gestor-local-teste' }, gestorDb),
    error => error.code === 'permission-denied' || error.code === 'firestore/permission-denied'
  );

  const audits = await getDocs(query(collection(adminDb, `${root}/auditoria`), where('tipo', 'in', ['AGENDA_CANCELADA', 'AGENDA_EXCLUIDA'])));
  const auditTypes = audits.docs.map(item => item.data().tipo);
  assert.ok(auditTypes.includes('AGENDA_CANCELADA'));
  assert.ok(auditTypes.includes('AGENDA_EXCLUIDA'));
  console.log('Validação local concluída: cancelamento, auditorias, exclusão vazia, bloqueio por histórico e permissões do gestor confirmados.');
} finally {
  await environment.cleanup();
}
