import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebaseAuth.js';

let functions = null;
let emailFunctions = null;

const getFunctionsClient = () => {
  if (!app) throw new Error('FIREBASE_NAO_INICIALIZADO');
  if (!functions) functions = getFunctions(app);
  return functions;
};

const getEmailFunctionsClient = () => {
  if (!app) throw new Error('FIREBASE_NAO_INICIALIZADO');
  if (!emailFunctions) emailFunctions = getFunctions(app, 'southamerica-east1');
  return emailFunctions;
};

export const updateUserAccessOnServer = async payload => {
  const response = await httpsCallable(getFunctionsClient(), 'updateUserAccess')(payload);
  return response.data;
};

const callEmailFunction = async (name, payload = {}) => (await httpsCallable(getEmailFunctionsClient(), name)(payload)).data;
export const sendAccessActivationOnServer = pessoaBaseId => callEmailFunction('sendAccessActivationMailjet', { pessoaBaseId });
export const sendEmailVerificationOnServer = () => callEmailFunction('sendEmailVerificationMailjet');
export const sendPasswordResetOnServer = email => callEmailFunction('sendPasswordResetMailjet', { email });
export const resendEmailCommunicationOnServer = communicationId => callEmailFunction('resendEmailCommunicationMailjet', { communicationId });
export const requestRegistrationEmailCodeOnServer = (linkId, email) => callEmailFunction('requestRegistrationEmailCode', { linkId, email });
export const confirmRegistrationEmailCodeOnServer = (verificationId, code) => callEmailFunction('confirmRegistrationEmailCode', { verificationId, code });
