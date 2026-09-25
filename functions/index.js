import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import process from 'node:process';
import { assertAdminContinuity, isActiveAdmin, requiresActiveMember, requiresAdminCount, resolveProjectId, validateAccessAuthorizationCreation, validateUserPersonLinkChange } from './adminPolicy.js';
import { buildApprovedRegistrationEmail, sendMailjetEmail, sendMailjetMessage, shouldSendApprovedRegistrationEmail } from './registrationEmail.js';
import { buildActivationEmail, buildPasswordResetEmail, buildVerificationEmail, getSystemBaseUrl } from './accountEmail.js';
import { buildRegistrationEvidenceHash, buildRegistrationVerificationEmail, createVerificationCode, hashVerificationCode, hashVerificationIdentity, isVerificationEmail, normalizeVerificationEmail, verificationCodeMatches } from './registrationVerification.js';
import { assertMemberEmailAvailable, getMemberEmailIndexId, isActiveMemberIdentity, validateSecurePersonPayload } from './personIdentity.js';
import { normalizeWorkerIds, validateAttendanceWorkers, validateDayCanClose } from './attendanceWorkers.js';
import { getScheduledWorkerIds } from './workGroups.js';
import { buildBookVolumeHash, verifyBookVolumeHash } from './bookVolume.js';
import { buildBookAttendances } from './bookRecord.js';
import { getBookCompetence, isPreviousOpenBookVolume } from './bookSchedule.js';
import { buildPublicBookAuthenticity } from './bookAuthenticity.js';

if (!getApps().length) initializeApp();

const allowedRoles = new Set(['admin', 'gestor', 'atendimento']);
const fail = (code, message) => { throw new HttpsError(code, message); };
const normalizeIdentityEmail = value => String(value || '').trim().toLowerCase();
const normalizeWorkName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const isActiveMemberRecord = person => person?.ativo !== false && String(person?.vinculo || person?.tipoPessoa || '').trim().toLowerCase() === 'membro';
const PERSON_EDITABLE_FIELDS = new Set(['vinculo', 'funcoesCasa', 'tipoPessoa', 'nome', 'dataNascimento', 'cpf', 'contato', 'email', 'responsavelCpf', 'responsavelNome', 'responsavelContato', 'sexo', 'estadoCivil', 'endereco', 'dadosCasa', 'statusCadastro', 'origemCadastro', 'busca']);
const cleanPersonPayload = data => Object.fromEntries(Object.entries(data || {}).filter(([key, value]) => PERSON_EDITABLE_FIELDS.has(key) && value !== undefined));
const mailjetApiKey = defineSecret('MAILJET_API_KEY');
const mailjetSecretKey = defineSecret('MAILJET_SECRET_KEY');
const registrationEmailFrom = defineSecret('REGISTRATION_EMAIL_FROM');
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
    if (!executor.exists || executor.data().ativo === false || !allowedRoles.has(executor.data().role)) fail('permission-denied', 'ACESSO_INTERNO_OBRIGATORIO');
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
      if (!responsibleSnapshot.exists || responsible?.ativo === false || !isActiveMemberRecord(responsible) || !/^\d{11}$/.test(String(responsible.cpf || '').replace(/\D/g, ''))) fail('failed-precondition', 'DIRIGENTE_RESPONSAVEL_INVALIDA');
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
  const signerCpf = String(request.data?.signerCpf || '').replace(/\D/g, '');
  const pdfBase64 = String(request.data?.pdfBase64 || '');
  if (!volumeId || !signerPersonId || !/^\d{11}$/.test(signerCpf) || request.data?.confirmed !== true || !pdfBase64) fail('invalid-argument', 'ASSINATURA_INVALIDA');
  const pdf = Buffer.from(pdfBase64, 'base64');
  if (pdf.length < 5 || pdf.length > 8 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== '%PDF-') fail('invalid-argument', 'PDF_INVALIDO');
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
  const filePath = `livro-mediunico/${projectId}/volume-${Number(volume.data().numero)}-${volumeId}-${fileHash.slice(0, 12)}.pdf`;
  const file = getStorage().bucket().file(filePath);
  await file.save(pdf, { resumable: false, contentType: 'application/pdf', metadata: { cacheControl: 'private, no-store', metadata: { volumeId, sha256: fileHash } } });
  const now = FieldValue.serverTimestamp();
  await firestore.runTransaction(async transaction => {
    const freshVolume = await transaction.get(root.collection('livro_mediunico_volumes').doc(volumeId));
    if (!freshVolume.exists || freshVolume.data().status !== 'encerrado') fail('failed-precondition', 'VOLUME_NAO_ENCERRADO');
    if (freshVolume.data().hashIntegridade !== integrity.calculatedHash) fail('failed-precondition', 'VOLUME_INTEGRIDADE_DIVERGENTE');
    const signature = { pessoaBaseId: signerPersonId, nome: String(signerData.nome || '').trim(), papel: role, cpfFinal: signerCpf.slice(-2), confirmadoPor: request.auth.uid };
    transaction.update(freshVolume.ref, { status: 'arquivado', arquivo: { caminho: filePath, nome: `livro-mediunico-volume-${Number(volume.data().numero)}.pdf`, tamanho: pdf.length, mimeType: 'application/pdf', hashSha256: fileHash }, assinatura: signature, assinadoEm: now, arquivadoEm: now, arquivadoPor: request.auth.uid, atualizadoEm: now });
    transaction.set(root.collection('auditoria').doc(), { tipo: 'LIVRO_VOLUME_ARQUIVADO', alvoId: volumeId, volumeId, volumeNumero: volume.data().numero, dirigenteResponsavel: signature, hashArquivo: fileHash, executadoPor: request.auth.uid, criadoEm: now });
  });
  return { archived: true, fileHash };
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
  const [url] = await getStorage().bucket().file(volume.data().arquivo.caminho).getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000, responseDisposition: `attachment; filename="${volume.data().arquivo.nome}"` });
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
  const nome = String(request.data?.nome || '').trim();
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
    if (destinationAgenda.cpfObrigatorio === true && !/^\d{11}$/.test(String(person.cpf || '').replace(/\D/g, ''))) fail('failed-precondition', 'CPF_OBRIGATORIO_EVENTO');
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
