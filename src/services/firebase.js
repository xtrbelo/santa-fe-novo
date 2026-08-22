import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  Timestamp, 
  getDocs,
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
export const findPessoaByCpf = async (cpfClean) => {
  if (!db) return null;
  const q = query(getAppCollection('pessoas'), where('cpf', '==', cpfClean), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() };
};

export {
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Timestamp,
  getDocs,
  query,
  where,
  limit
};
