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
  if (agenda.status === 'Concluída') throw new Error('AGENDA_CONCLUIDA');
  const permittedTypes = agenda.tiposPessoaPermitidos || [];
  if (permittedTypes.length && !permittedTypes.includes(pessoa.tipoPessoa)) throw new Error('TIPO_PESSOA_NAO_PERMITIDO');
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
    if (agendaSnapshot.data().status === 'Concluída') throw new Error('AGENDA_CONCLUIDA');
    if (appointmentSnapshot.exists() && appointmentSnapshot.data().status !== 'Cancelado') throw new Error('AGENDAMENTO_DUPLICADO');

    const agendaData = agendaSnapshot.data();
    const transactionPermittedTypes = agendaData.tiposPessoaPermitidos || [];
    if (transactionPermittedTypes.length && !transactionPermittedTypes.includes(pessoa.tipoPessoa)) throw new Error('TIPO_PESSOA_NAO_PERMITIDO');
    const occupied = { ...(agendaData.vagasOcupadas || {}) };
    servicos.filter(service => service.requerVagas).forEach(service => {
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
    if (agendaData.status === 'Concluída') throw new Error('AGENDA_CONCLUIDA');
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
    if (agendaSnapshot.data().status === 'Concluída') throw new Error('AGENDA_CONCLUIDA');
    if (!['Agendado', 'Presente'].includes(appointmentSnapshot.data().status)) throw new Error('STATUS_SEM_PRIORIDADE');
    const now = Timestamp.now();
    transaction.update(appointmentRef, { prioridade: Boolean(prioridade), atualizadoEm: now, atualizadoPor: userId });
    transaction.set(createAuditRef(firestore), { tipo: 'PRIORIDADE_ALTERADA', alvoId: agendamentoId, agendaId, valorNovo: Boolean(prioridade), executadoPor: userId, criadoEm: now });
  });
};

export const updateAtendimentoStatus = async ({ agendaId, agendamentoId, status, userId }) => {
  const agendaRef = getAppDoc('agendas', agendaId);
  const appointmentRef = getAppDoc('consulentes', agendamentoId);
  await runTransaction(db, async transaction => {
    const [agendaSnapshot, appointmentSnapshot] = await Promise.all([transaction.get(agendaRef), transaction.get(appointmentRef)]);
    if (!agendaSnapshot.exists() || !appointmentSnapshot.exists()) throw new Error('REGISTRO_NAO_ENCONTRADO');
    if (agendaSnapshot.data().status === 'Concluída') throw new Error('AGENDA_CONCLUIDA');
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
    if (agendaSnapshot.data().status === 'Concluída') throw new Error('AGENDA_CONCLUIDA');
    const now = Timestamp.now();
    transaction.update(agendaRef, { status: 'Concluída', concluidaEm: now, concluidaPor: userId, atualizadoEm: now, atualizadoPor: userId });
    transaction.set(createAuditRef(firestore), { tipo: 'AGENDA_CONCLUIDA', alvoId: agendaId, executadoPor: userId, criadoEm: now });
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
