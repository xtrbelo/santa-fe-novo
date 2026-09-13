import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebaseAuth.js';

let functions = null;

const getFunctionsClient = () => {
  if (!app) throw new Error('FIREBASE_NAO_INICIALIZADO');
  if (!functions) functions = getFunctions(app);
  return functions;
};

export const updateUserAccessOnServer = async payload => {
  const response = await httpsCallable(getFunctionsClient(), 'updateUserAccess')(payload);
  return response.data;
};
