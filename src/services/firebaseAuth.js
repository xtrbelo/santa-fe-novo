import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';

const hasViteEnv = typeof import.meta.env === 'object';
const viteEnv = hasViteEnv ? {
  mode: import.meta.env.MODE,
  dev: import.meta.env.DEV,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  useFirebaseEmulators: import.meta.env.VITE_USE_FIREBASE_EMULATORS,
  useFirestoreEmulator: import.meta.env.VITE_USE_FIRESTORE_EMULATOR,
} : {};

export const firebaseConfig = {
  apiKey: viteEnv.apiKey,
  authDomain: viteEnv.authDomain,
  projectId: viteEnv.projectId,
  storageBucket: viteEnv.storageBucket,
  messagingSenderId: viteEnv.messagingSenderId,
  appId: viteEnv.appId,
  measurementId: viteEnv.measurementId,
};

const requiredFirebaseConfig = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const expectedProjectIdByMode = { hml: 'santa-fe-v2-hml', production: 'santa-fe-v2-prod' };

if (hasViteEnv) {
  const missing = requiredFirebaseConfig.filter(key => !firebaseConfig[key]);
  if (missing.length) throw new Error(`FIREBASE_CONFIG_INCOMPLETA:${missing.join(',')}`);
  const expectedProjectId = expectedProjectIdByMode[viteEnv.mode];
  if (expectedProjectId && firebaseConfig.projectId !== expectedProjectId) {
    throw new Error(`FIREBASE_PROJECT_ID_INVALIDO:${viteEnv.mode}`);
  }
}

export const isFirebaseConfigured = requiredFirebaseConfig.every(key => !!firebaseConfig[key]);
export const firebaseRuntime = Object.freeze({
  dev: viteEnv.dev === true,
  useFirebaseEmulators: viteEnv.useFirebaseEmulators === 'true',
  useFirestoreEmulator: viteEnv.useFirestoreEmulator === 'true',
});

export let app = null;
export let auth = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  if (firebaseRuntime.dev && firebaseRuntime.useFirebaseEmulators && !globalThis.__santaFeAuthEmulatorConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    globalThis.__santaFeAuthEmulatorConnected = true;
  }
}

export const appId = firebaseConfig.projectId || 'santa-fe-node-test';

export {
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
};
