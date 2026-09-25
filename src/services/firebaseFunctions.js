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

export const createAccessAuthorizationOnServer = async payload => {
  const response = await httpsCallable(getFunctionsClient(), 'createAccessAuthorizationSecure')(payload);
  return response.data;
};

export const savePersonWithUniqueEmailOnServer = async payload => {
  const response = await httpsCallable(getFunctionsClient(), 'savePersonWithUniqueEmail')(payload);
  return response.data;
};

export const updateMemberLifecycleOnServer = async payload => {
  const response = await httpsCallable(getFunctionsClient(), 'updateMemberLifecycleSecure')(payload);
  return response.data;
};

export const rebuildMemberEmailIndexOnServer = async pessoaBaseId => {
  const response = await httpsCallable(getFunctionsClient(), 'rebuildMemberEmailIndexSecure')({ pessoaBaseId });
  return response.data;
};

export const archiveAuditHistoryOnServer = async action => {
  const response = await httpsCallable(getFunctionsClient(), 'archiveAuditHistory')({ action });
  return response.data;
};

export const closeDayWithWorkersOnServer = async payload => {
  const response = await httpsCallable(getFunctionsClient(), 'closeDayWithWorkers')(payload);
  return response.data;
};

export const manageBookVolumeOnServer = async action => {
  const response = await httpsCallable(getFunctionsClient(), 'manageBookVolume')({ action });
  return response.data;
};

export const archiveBookVolumeOnServer = async payload => (await httpsCallable(getFunctionsClient(), 'archiveBookVolume')(payload)).data;
export const getBookVolumeDownloadOnServer = async volumeId => (await httpsCallable(getFunctionsClient(), 'getBookVolumeDownload')({ volumeId })).data;
export const refreshBookRecordOnServer = async payload => (await httpsCallable(getFunctionsClient(), 'refreshBookRecord')(payload)).data;
export const verifyBookVolumeIntegrityOnServer = async volumeId => (await httpsCallable(getFunctionsClient(), 'verifyBookVolumeIntegrity')({ volumeId })).data;
export const checkBookVolumeAuthenticityOnServer = async verificationCode => (await httpsCallable(getFunctionsClient(), 'checkBookVolumeAuthenticity')({ verificationCode })).data;

export const updateWorkTypeOnServer = async payload => {
  const response = await httpsCallable(getFunctionsClient(), 'updateWorkType')(payload);
  return response.data;
};

export const updateAppointmentOnServer = async payload => {
  const response = await httpsCallable(getFunctionsClient(), 'updateAppointment')(payload);
  return response.data;
};

const callEmailFunction = async (name, payload = {}) => (await httpsCallable(getEmailFunctionsClient(), name)(payload)).data;
export const sendAccessActivationOnServer = pessoaBaseId => callEmailFunction('sendAccessActivationMailjet', { pessoaBaseId });
export const sendEmailVerificationOnServer = () => callEmailFunction('sendEmailVerificationMailjet');
export const sendPasswordResetOnServer = email => callEmailFunction('sendPasswordResetMailjet', { email });
export const resendEmailCommunicationOnServer = communicationId => callEmailFunction('resendEmailCommunicationMailjet', { communicationId });
export const requestRegistrationEmailCodeOnServer = (linkId, email) => callEmailFunction('requestRegistrationEmailCode', { linkId, email });
export const confirmRegistrationEmailCodeOnServer = (verificationId, code) => callEmailFunction('confirmRegistrationEmailCode', { verificationId, code });
