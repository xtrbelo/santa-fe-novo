import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
} from 'firebase/firestore';
import {
  app,
  appId,
  auth,
  firebaseConfig,
  firebaseRuntime,
  isFirebaseConfigured,
} from './firebaseAuth.js';

export let db = null;

if (isFirebaseConfigured) {
  db = getFirestore(app);
  const useFirestoreEmulator = firebaseRuntime.dev
    && (firebaseRuntime.useFirebaseEmulators || firebaseRuntime.useFirestoreEmulator);
  if (useFirestoreEmulator && !globalThis.__santaFeFirestoreEmulatorConnected) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    globalThis.__santaFeFirestoreEmulatorConnected = true;
  }
}

export const getAppCollection = collName => {
  if (!db) throw new Error('Firestore não inicializado');
  return collection(db, 'artifacts', appId, 'public', 'data', collName);
};

export const getAppDoc = (collName, docId) => {
  if (!db) throw new Error('Firestore não inicializado');
  return doc(db, 'artifacts', appId, 'public', 'data', collName, docId);
};

export {
  app,
  appId,
  auth,
  firebaseConfig,
  getDoc,
  isFirebaseConfigured,
  onSnapshot,
};
