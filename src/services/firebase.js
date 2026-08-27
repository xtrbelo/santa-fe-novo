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

export const createAgendamento = async ({ agenda, pessoa, servicos, userId, status, horaChegada = null }) => {
  const existingQuery = query(getAppCollection('consulentes'), where('agendaId', '==', agenda.id));
  const existingSnapshot = await getDocs(existingQuery);
  const activeAppointments = existingSnapshot.docs.map(item => item.data()).filter(item => item.status !== 'Cancelado');
  if (activeAppointments.some(item => item.pessoaBaseId === pessoa.id)) throw new Error('AGENDAMENTO_DUPLICADO');

  const realOccupancy = {};
  activeAppointments.forEach(item => (item.servicosIds || []).forEach(serviceId => {
    realOccupancy[serviceId] = (realOccupancy[serviceId] || 0) + 1;
  }));

  const agendaRef = getAppDoc('agendas', agenda.id);
  const appointmentRef = getAppDoc('consulentes', `${agenda.id}_${pessoa.id}`);
  await runTransaction(db, async transaction => {
    const [agendaSnapshot, appointmentSnapshot] = await Promise.all([transaction.get(agendaRef), transaction.get(appointmentRef)]);
    if (!agendaSnapshot.exists()) throw new Error('AGENDA_NAO_ENCONTRADA');
    if (appointmentSnapshot.exists() && appointmentSnapshot.data().status !== 'Cancelado') throw new Error('AGENDAMENTO_DUPLICADO');

    const agendaData = agendaSnapshot.data();
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
