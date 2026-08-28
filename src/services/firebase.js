import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  onSnapshot, 
  Timestamp, 
  serverTimestamp,
  getDoc,
  setDoc,
  getDocs,
  runTransaction,
  writeBatch,
  query,
  where,
  limit
} from 'firebase/firestore';
import { agendaAceitaServico, getAgendaPublicosPermitidos, getPessoaVinculo, servicoAtivoNaAgenda, servicoControlaVagas } from '../utils/domain.js';

const getEnv = (key, fallback) => {
  try {
    return import.meta.env[key] || fallback;
  } catch {
    return fallback;
  }
};

export const firebaseConfig = { 
  apiKey: getEnv('VITE_FIREBASE_API_KEY', "AIzaSyAgh2X59GS79HyK7NNr4XL6lM8ZlbmRIdk"),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN', "santa-fe-v2.firebaseapp.com"),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID', "santa-fe-v2"),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET', "santa-fe-v2.firebasestorage.app"),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', "551191620226"),
  appId: getEnv('VITE_FIREBASE_APP_ID', "1:551191620226:web:b063c40808009ca0c4229b"),
  measurementId: getEnv('VITE_FIREBASE_MEASUREMENT_ID', "G-P9RZWEHYQR")
};

export const isFirebaseConfigured = !!firebaseConfig.apiKey;

export let app = null;
export let auth = null;
export let db = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export const appId = firebaseConfig.projectId || 'santa-fe-v2';

/**
 * Retorna a referência da coleção padronizada
 */
export const getAppCollection = (collName) => {
  if (!db) throw new Error("Firestore não inicializado");
  return collection(db, 'artifacts', appId, 'public', 'data', collName);
};

/**
 * Retorna a referência de um documento específico
 */
export const getAppDoc = (collName, docId) => {
  if (!db) throw new Error("Firestore não inicializado");
  return doc(db, 'artifacts', appId, 'public', 'data', collName, docId);
};

const getDataCollection = (firestore, collName) => collection(firestore, 'artifacts', appId, 'public', 'data', collName);
const getDataDoc = (firestore, collName, docId) => doc(firestore, 'artifacts', appId, 'public', 'data', collName, docId);

/**
 * Busca otimizada de pessoa por CPF no Firestore utilizando indexação direta
 */
export const findPessoaByCpf = async (cpfClean, includeInactive = false) => {
  if (!db) return null;
  const q = query(getAppCollection('pessoas'), where('cpf', '==', cpfClean));
  const snap = await getDocs(q);
  const docSnap = snap.docs.find(item => includeInactive || item.data().ativo !== false);
  if (!docSnap) return null;
  return { id: docSnap.id, ...docSnap.data() };
};

export const createAgendamento = async ({ agenda, pessoa, servicos, userId, status, horaChegada = null }, firestore = db) => {
  if (['Concluída', 'Cancelada'].includes(agenda.status)) throw new Error('AGENDA_INDISPONIVEL');
  const permittedTypes = getAgendaPublicosPermitidos(agenda);
  if (permittedTypes.length && !permittedTypes.includes(getPessoaVinculo(pessoa))) throw new Error('PUBLICO_NAO_PERMITIDO');
  servicos.forEach(service => {
    if (!agendaAceitaServico(agenda, service.id)) throw new Error(`SERVICO_NAO_DISPONIVEL:${service.nome}`);
    if (!servicoAtivoNaAgenda(agenda, service.id)) throw new Error(`SERVICO_CANCELADO:${service.nome}`);
  });
  const existingQuery = query(getDataCollection(firestore, 'consulentes'), where('agendaId', '==', agenda.id));
  const existingSnapshot = await getDocs(existingQuery);
  const activeAppointments = existingSnapshot.docs.map(item => item.data()).filter(item => item.status !== 'Cancelado');
  if (activeAppointments.some(item => item.pessoaBaseId === pessoa.id)) throw new Error('AGENDAMENTO_DUPLICADO');

  const realOccupancy = {};
  activeAppointments.forEach(item => (item.servicosIds || []).forEach(serviceId => {
    realOccupancy[serviceId] = (realOccupancy[serviceId] || 0) + 1;
  }));

  const agendaRef = getDataDoc(firestore, 'agendas', agenda.id);
  const appointmentRef = getDataDoc(firestore, 'consulentes', `${agenda.id}_${pessoa.id}`);
  await runTransaction(firestore, async transaction => {
    const [agendaSnapshot, appointmentSnapshot] = await Promise.all([transaction.get(agendaRef), transaction.get(appointmentRef)]);
    if (!agendaSnapshot.exists()) throw new Error('AGENDA_NAO_ENCONTRADA');
    if (['Concluída', 'Cancelada'].includes(agendaSnapshot.data().status)) throw new Error('AGENDA_INDISPONIVEL');
    if (appointmentSnapshot.exists() && appointmentSnapshot.data().status !== 'Cancelado') throw new Error('AGENDAMENTO_DUPLICADO');

    const agendaData = agendaSnapshot.data();
    const transactionPermittedTypes = getAgendaPublicosPermitidos(agendaData);
    if (transactionPermittedTypes.length && !transactionPermittedTypes.includes(getPessoaVinculo(pessoa))) throw new Error('PUBLICO_NAO_PERMITIDO');
    servicos.forEach(service => {
      if (!agendaAceitaServico(agendaData, service.id)) throw new Error(`SERVICO_NAO_DISPONIVEL:${service.nome}`);
      if (!servicoAtivoNaAgenda(agendaData, service.id)) throw new Error(`SERVICO_CANCELADO:${service.nome}`);
    });
    const occupied = { ...(agendaData.vagasOcupadas || {}) };
    servicos.filter(servicoControlaVagas).forEach(service => {
      const total = Number(agendaData.vagasTotais?.[service.id] || 0);
      const current = Math.max(Number(occupied[service.id] || 0), Number(realOccupancy[service.id] || 0));
      if (current >= total) throw new Error(`SEM_VAGA:${service.nome}`);
      occupied[service.id] = current + 1;
    });

    const now = Timestamp.now();
    transaction.set(appointmentRef, {
      agendaId: agenda.id, nome: pessoa.nome, pessoaBaseId: pessoa.id, cpf: pessoa.cpf || '', status,
      ...(horaChegada ? { horaChegada } : {}), servicosIds: servicos.map(service => service.id),
      servicosNomes: servicos.map(service => service.nome), criadoEm: now, criadoPor: userId,
      atualizadoEm: now, atualizadoPor: userId, prioridade: false
    });
    transaction.update(agendaRef, { vagasOcupadas: occupied, atualizadoEm: now, atualizadoPor: userId });
  });
};

const createAuditRef = firestore => doc(getDataCollection(firestore, 'auditoria'));

export const cancelAgendamento = async ({ agendaId, agendamentoId, userId, motivo = null }, firestore = db) => {
  const agendaRef = getDataDoc(firestore, 'agendas', agendaId);
  const appointmentRef = getDataDoc(firestore, 'consulentes', agendamentoId);
  await runTransaction(firestore, async transaction => {
    const [agendaSnapshot, appointmentSnapshot] = await Promise.all([transaction.get(agendaRef), transaction.get(appointmentRef)]);
    if (!agendaSnapshot.exists() || !appointmentSnapshot.exists()) throw new Error('REGISTRO_NAO_ENCONTRADO');
    const agendaData = agendaSnapshot.data();
    const appointment = appointmentSnapshot.data();
    if (['Concluída', 'Cancelada'].includes(agendaData.status)) throw new Error('AGENDA_INDISPONIVEL');
    if (appointment.status === 'Cancelado') throw new Error('JA_CANCELADO');
    if (appointment.status === 'Concluído') throw new Error('ATENDIMENTO_CONCLUIDO');
    if (!['Agendado', 'Presente'].includes(appointment.status)) throw new Error('STATUS_NAO_CANCELAVEL');

    const occupied = { ...(agendaData.vagasOcupadas || {}) };
    (appointment.servicosIds || []).forEach(serviceId => {
      if (Object.hasOwn(agendaData.vagasTotais || {}, serviceId)) {
        occupied[serviceId] = Math.max(0, Number(occupied[serviceId] || 0) - 1);
      }
    });
    const now = Timestamp.now();
    transaction.update(agendaRef, { vagasOcupadas: occupied, atualizadoEm: now, atualizadoPor: userId });
    transaction.update(appointmentRef, {
      status: 'Cancelado', canceladoEm: now, canceladoPor: userId,
      ...(motivo ? { motivoCancelamento: motivo.trim() } : {}), atualizadoEm: now, atualizadoPor: userId
    });
    transaction.set(createAuditRef(firestore), { tipo: 'AGENDAMENTO_CANCELADO', alvoId: agendamentoId, agendaId, executadoPor: userId, criadoEm: now });
  });
};

export const setAgendamentoPrioridade = async ({ agendaId, agendamentoId, prioridade, userId }, firestore = db) => {
  const agendaRef = getDataDoc(firestore, 'agendas', agendaId);
  const appointmentRef = getDataDoc(firestore, 'consulentes', agendamentoId);
  await runTransaction(firestore, async transaction => {
    const [agendaSnapshot, appointmentSnapshot] = await Promise.all([transaction.get(agendaRef), transaction.get(appointmentRef)]);
    if (!agendaSnapshot.exists() || !appointmentSnapshot.exists()) throw new Error('REGISTRO_NAO_ENCONTRADO');
    if (['Concluída', 'Cancelada'].includes(agendaSnapshot.data().status)) throw new Error('AGENDA_INDISPONIVEL');
    if (!['Agendado', 'Presente'].includes(appointmentSnapshot.data().status)) throw new Error('STATUS_SEM_PRIORIDADE');
    const now = Timestamp.now();
    transaction.update(appointmentRef, { prioridade: Boolean(prioridade), atualizadoEm: now, atualizadoPor: userId });
    transaction.set(createAuditRef(firestore), { tipo: 'PRIORIDADE_ALTERADA', alvoId: agendamentoId, agendaId, valorNovo: Boolean(prioridade), executadoPor: userId, criadoEm: now });
  });
};

export const updateAtendimentoStatus = async ({ agendaId, agendamentoId, status, userId }, firestore = db) => {
  const agendaRef = getDataDoc(firestore, 'agendas', agendaId);
  const appointmentRef = getDataDoc(firestore, 'consulentes', agendamentoId);
  await runTransaction(firestore, async transaction => {
    const [agendaSnapshot, appointmentSnapshot] = await Promise.all([transaction.get(agendaRef), transaction.get(appointmentRef)]);
    if (!agendaSnapshot.exists() || !appointmentSnapshot.exists()) throw new Error('REGISTRO_NAO_ENCONTRADO');
    if (['Concluída', 'Cancelada'].includes(agendaSnapshot.data().status)) throw new Error('AGENDA_INDISPONIVEL');
    const current = appointmentSnapshot.data();
    const allowed = current.status === 'Agendado' ? ['Presente', 'Faltou'] : current.status === 'Presente' ? ['Concluído'] : [];
    if (!allowed.includes(status)) throw new Error('TRANSICAO_INVALIDA');
    const now = Timestamp.now();
    const data = { status, atualizadoEm: now, atualizadoPor: userId };
    if (status === 'Presente' && !current.horaChegada) data.horaChegada = now;
    if (status === 'Concluído' && !current.horaSaida) data.horaSaida = now;
    transaction.update(appointmentRef, data);
  });
};

export const concluirAgenda = async ({ agendaId, userId }, firestore = db) => {
  const agendaRef = getDataDoc(firestore, 'agendas', agendaId);
  await runTransaction(firestore, async transaction => {
    const agendaSnapshot = await transaction.get(agendaRef);
    if (!agendaSnapshot.exists()) throw new Error('AGENDA_NAO_ENCONTRADA');
    if (['Concluída', 'Cancelada'].includes(agendaSnapshot.data().status)) throw new Error('AGENDA_INDISPONIVEL');
    const now = Timestamp.now();
    transaction.update(agendaRef, { status: 'Concluída', concluidaEm: now, concluidaPor: userId, atualizadoEm: now, atualizadoPor: userId });
    transaction.set(createAuditRef(firestore), { tipo: 'AGENDA_CONCLUIDA', alvoId: agendaId, executadoPor: userId, criadoEm: now });
  });
};

const getAgendaAppointments = async (firestore, agendaId) => {
  const snapshot = await getDocs(query(getDataCollection(firestore, 'consulentes'), where('agendaId', '==', agendaId)));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
};

export const editarAgenda = async ({ agendaId, changes, userId }, firestore = db) => {
  const appointments = await getAgendaAppointments(firestore, agendaId);
  const agendaRef = getDataDoc(firestore, 'agendas', agendaId);
  await runTransaction(firestore, async transaction => {
    const snapshot = await transaction.get(agendaRef);
    if (!snapshot.exists()) throw new Error('AGENDA_NAO_ENCONTRADA');
    const current = snapshot.data();
    if (['Concluída', 'Cancelada'].includes(current.status)) throw new Error('AGENDA_INDISPONIVEL');
    if (changes.tipoTrabalhoId && changes.tipoTrabalhoId !== current.tipoTrabalhoId && appointments.length) throw new Error('TIPO_COM_ATENDIMENTOS');
    const currentServiceIds = current.servicosIds?.length
      ? current.servicosIds
      : [...new Set(appointments.flatMap(item => item.servicosIds || []))];
    const removed = currentServiceIds.filter(id => !(changes.servicosIds || []).includes(id));
    if (removed.some(id => appointments.some(item => item.status !== 'Cancelado' && (item.servicosIds || []).includes(id)))) throw new Error('SERVICO_COM_ATENDIMENTOS');
    Object.entries(changes.vagasTotais || {}).forEach(([id, total]) => {
      if (Number(total) < Number(current.vagasOcupadas?.[id] || 0)) throw new Error('LIMITE_MENOR_QUE_OCUPACAO');
    });
    const now = Timestamp.now();
    const vagasOcupadas = changes.vagasTotais
      ? Object.fromEntries(Object.keys(changes.vagasTotais).map(id => [id, Number(current.vagasOcupadas?.[id] || 0)]))
      : current.vagasOcupadas;
    transaction.update(agendaRef, { ...changes, vagasOcupadas, atualizadoEm: now, atualizadoPor: userId });
    transaction.set(createAuditRef(firestore), { tipo: 'AGENDA_EDITADA', agendaId, executadoPor: userId, criadoEm: now });
  });
};

export const cancelarServicoAgenda = async ({ agendaId, servicoId, userId }, firestore = db) => {
  const appointments = await getAgendaAppointments(firestore, agendaId);
  const affected = appointments.filter(item => item.status !== 'Cancelado' && (item.servicosIds || []).includes(servicoId)).length;
  const agendaRef = getDataDoc(firestore, 'agendas', agendaId);
  await runTransaction(firestore, async transaction => {
    const snapshot = await transaction.get(agendaRef);
    if (!snapshot.exists()) throw new Error('AGENDA_NAO_ENCONTRADA');
    const agenda = snapshot.data();
    if (['Concluída', 'Cancelada'].includes(agenda.status)) throw new Error('AGENDA_INDISPONIVEL');
    const now = Timestamp.now();
    transaction.update(agendaRef, {
      servicosStatus: { ...(agenda.servicosStatus || {}), [servicoId]: 'Cancelado' },
      servicosCancelamentos: { ...(agenda.servicosCancelamentos || {}), [servicoId]: { canceladoEm: now, canceladoPor: userId } },
      atualizadoEm: now, atualizadoPor: userId
    });
    transaction.set(createAuditRef(firestore), { tipo: 'SERVICO_AGENDA_CANCELADO', agendaId, servicoId, pessoasAfetadas: affected, executadoPor: userId, criadoEm: now });
  });
  return affected;
};

export const cancelarAgenda = async ({ agendaId, userId }, firestore = db) => {
  const agendaRef = getDataDoc(firestore, 'agendas', agendaId);
  await runTransaction(firestore, async transaction => {
    const snapshot = await transaction.get(agendaRef);
    if (!snapshot.exists()) throw new Error('AGENDA_NAO_ENCONTRADA');
    if (['Concluída', 'Cancelada'].includes(snapshot.data().status)) throw new Error('AGENDA_INDISPONIVEL');
    const now = Timestamp.now();
    transaction.update(agendaRef, { status: 'Cancelada', canceladaEm: now, canceladaPor: userId, atualizadoEm: now, atualizadoPor: userId });
    transaction.set(createAuditRef(firestore), { tipo: 'AGENDA_CANCELADA', agendaId, executadoPor: userId, criadoEm: now });
  });
};

export const excluirAgendaVazia = async ({ agendaId, userId }, firestore = db) => {
  const appointments = await getAgendaAppointments(firestore, agendaId);
  if (appointments.length) throw new Error('AGENDA_POSSUI_HISTORICO');
  const agendaRef = getDataDoc(firestore, 'agendas', agendaId);
  await runTransaction(firestore, async transaction => {
    const snapshot = await transaction.get(agendaRef);
    if (!snapshot.exists()) throw new Error('AGENDA_NAO_ENCONTRADA');
    const now = Timestamp.now();
    transaction.delete(agendaRef);
    transaction.set(createAuditRef(firestore), { tipo: 'AGENDA_EXCLUIDA', agendaId, executadoPor: userId, criadoEm: now });
  });
};

export {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  getDoc,
  setDoc,
  getDocs,
  runTransaction,
  writeBatch,
  query,
  where,
  limit
};
