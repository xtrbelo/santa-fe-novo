import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  connectAuthEmulator,
  GoogleAuthProvider, 
  isSignInWithEmailLink,
  sendEmailVerification,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithEmailAndPassword,
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  updatePassword,
} from 'firebase/auth';
import { 
  getFirestore, 
  connectFirestoreEmulator,
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
  limit,
  orderBy,
  startAfter,
  documentId,
  deleteField
} from 'firebase/firestore';
import { agendaAceitaServico, getAgendaPublicosPermitidos, getNomePessoaAtendimento, getNomeServicoAtendimento, getPessoaVinculo, getServicosAtivosAtendimento, servicoAtivoNaAgenda, servicoControlaVagas } from '../utils/domain.js';
import { buildPessoaSearchIndex, normalizeSearchDigits, normalizeSearchText, PESSOA_SEARCH_VERSION } from '../utils/pessoaSearch.js';
import { buildPessoaPayload, getEffectiveMemberFunctions, isValidEmail, normalizeEmail, validatePessoaPayload } from '../utils/pessoaForm.js';
import { buildMemberInviteUrl, generateMemberInviteToken, getMemberInviteEffectiveStatus, getMemberInviteExpiration, hashMemberInviteToken, isValidMemberInviteToken } from '../utils/memberInvite.js';
import { buildMemberSelfRegistrationPayload, validateMemberSelfRegistrationPayload } from '../utils/memberSelfRegistration.js';
import { buildPessoaFromSelfRegistration, normalizeRejectionReason, validateSelfRegistrationApproval, validateSelfRegistrationRejection } from '../utils/memberSelfRegistrationReview.js';
import { validateCPF } from '../utils/formatters.js';
import { ACCESS_AUTHORIZATION_STATUS, buildAccessAuthorization, buildAuthorizedUser, validateAccessAuthorization } from '../utils/accessAuthorization.js';
import { buildAccessActivationActionCodeSettings, normalizeAccessActivationEmail } from '../utils/accessActivation.js';
import { buildMyRegistrationUpdate } from '../utils/myRegistration.js';
import { LIFECYCLE_AUDIT_TYPES, requireLifecycleReason } from '../utils/lifecycle.js';
import { getAgendaSchedulingKey } from '../utils/agendaScheduling.js';

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

export let app = null;
export let auth = null;
export let db = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  const useAllFirebaseEmulators = viteEnv.dev === true && viteEnv.useFirebaseEmulators === 'true';
  const useFirestoreEmulator = viteEnv.dev === true
    && (useAllFirebaseEmulators || viteEnv.useFirestoreEmulator === 'true');
  if (useAllFirebaseEmulators && !globalThis.__santaFeAuthEmulatorConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    globalThis.__santaFeAuthEmulatorConnected = true;
  }
  if (useFirestoreEmulator && !globalThis.__santaFeFirestoreEmulatorConnected) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    globalThis.__santaFeFirestoreEmulatorConnected = true;
  }
}

export const appId = firebaseConfig.projectId || 'santa-fe-node-test';

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

export const searchPessoas = async (term, { limitResults = 12 } = {}, firestore = db) => {
  if (!firestore) return [];
  const raw = String(term || '').trim();
  const digits = normalizeSearchDigits(raw);
  const numericSearch = digits.length > 0 && !/[a-zA-ZÀ-ÿ]/.test(raw);
  const normalized = numericSearch ? digits : normalizeSearchText(raw);
  if (!normalized || (numericSearch ? normalized.length < 4 : normalized.length < 2)) return [];

  if (numericSearch && digits.length === 11) {
    const cpfQuery = query(getDataCollection(firestore, 'pessoas'), where('cpf', '==', digits), limit(1));
    const cpfSnapshot = await getDocs(cpfQuery);
    const exact = cpfSnapshot.docs[0];
    if (exact && exact.data().ativo !== false) return [{ id: exact.id, ...exact.data() }];
  }

  const snapshot = await getDocs(query(
    getDataCollection(firestore, 'pessoas'),
    where('busca.termos', 'array-contains', normalized),
    limit(Math.min(Math.max(1, limitResults), 20))
  ));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.ativo !== false);
};

export const getPessoaById = async (pessoaId, firestore = db) => {
  if (!pessoaId || !firestore) return null;
  const snapshot = await getDoc(getDataDoc(firestore, 'pessoas', pessoaId));
  if (!snapshot.exists() || snapshot.data().ativo === false) return null;
  return { id: snapshot.id, ...snapshot.data() };
};

let recentPessoasCache = null;
export const getRecentPessoas = async ({ limitResults = 6, refresh = false } = {}, firestore = db) => {
  if (!refresh && firestore === db && recentPessoasCache) return recentPessoasCache.slice(0, limitResults);
  const snapshot = await getDocs(query(getDataCollection(firestore, 'consulentes'), orderBy('criadoEm', 'desc'), limit(15)));
  const ids = [...new Set(snapshot.docs
    .map(item => item.data())
    .filter(item => !['Cancelado', 'Reagendado'].includes(item.status) && item.pessoaBaseId)
    .map(item => item.pessoaBaseId))].slice(0, limitResults + 4);
  const pessoas = (await Promise.all(ids.map(id => getPessoaById(id, firestore)))).filter(Boolean).slice(0, limitResults);
  if (firestore === db) recentPessoasCache = pessoas;
  return pessoas;
};

export const withPessoaSearchIndex = pessoa => ({ ...pessoa, busca: buildPessoaSearchIndex(pessoa) });

export const createPessoa = async ({ data, userId }, firestore = db) => {
  const pessoaRef = doc(getDataCollection(firestore, 'pessoas'));
  const cpf = normalizeSearchDigits(data.cpf);
  const normalizedData = buildPessoaPayload({ ...data, cpf: cpf || null });
  const validationError = validatePessoaPayload(normalizedData);
  if (validationError) throw new Error(`PESSOA_INVALIDA:${validationError}`);
  const now = Timestamp.now();
  await runTransaction(firestore, async transaction => {
    if (cpf) {
      const indexRef = getDataDoc(firestore, 'cpf_index', cpf);
      const indexSnapshot = await transaction.get(indexRef);
      if (indexSnapshot.exists()) throw new Error('CPF_DUPLICADO');
      transaction.set(indexRef, { pessoaId: pessoaRef.id, criadoEm: now });
    }
    transaction.set(pessoaRef, withPessoaSearchIndex({ ...normalizedData, ativo: true, criadoEm: now, criadoPor: userId, atualizadoEm: now, atualizadoPor: userId }));
  });
  return { id: pessoaRef.id, ...withPessoaSearchIndex({ ...normalizedData, ativo: true }) };
};

const createInviteCredentials = async origin => {
  const token = generateMemberInviteToken();
  const id = await hashMemberInviteToken(token);
  return { token, id, url: buildMemberInviteUrl(token, origin) };
};

export const createMemberInvite = async ({ nome, cpf, email, userId, origin }, firestore = db) => {
  const cleanCpf = normalizeSearchDigits(cpf);
  const normalizedName = String(nome || '').trim();
  const normalizedEmail = normalizeEmail(email) || null;
  if (!normalizedName) throw new Error('CONVITE_INVALIDO:O nome é obrigatório.');
  if (!validateCPF(cleanCpf)) throw new Error('CONVITE_INVALIDO:Informe um CPF válido.');
  if (normalizedEmail && !isValidEmail(normalizedEmail)) throw new Error('CONVITE_INVALIDO:Informe um e-mail válido.');
  const personIndexRef = getDataDoc(firestore, 'cpf_index', cleanCpf);
  const inviteIndexRef = getDataDoc(firestore, 'convite_membro_cpf_index', cleanCpf);
  const credentials = await createInviteCredentials(origin);
  const conviteRef = getDataDoc(firestore, 'convites_membro', credentials.id);
  const now = Timestamp.now();
  const expiraEm = Timestamp.fromDate(getMemberInviteExpiration(now.toDate()));
  const convite = { nome: normalizedName, cpf: cleanCpf, email: normalizedEmail, status: 'ativo', criadoEm: now, criadoPor: userId, expiraEm, atualizadoEm: now, atualizadoPor: userId };
  await runTransaction(firestore, async transaction => {
    const [personIndex, inviteIndex] = await Promise.all([transaction.get(personIndexRef), transaction.get(inviteIndexRef)]);
    if (personIndex.exists()) throw new Error('CPF_DUPLICADO');
    if (inviteIndex.exists()) {
      const indexedInviteId = inviteIndex.data().inviteId;
      if (typeof indexedInviteId !== 'string' || !indexedInviteId) throw new Error('INDICE_CONVITE_INVALIDO');
      const indexedInvite = await transaction.get(getDataDoc(firestore, 'convites_membro', indexedInviteId));
      if (!indexedInvite.exists()) throw new Error('INDICE_CONVITE_INVALIDO');
      const indexedInviteData = indexedInvite.data();
      if (indexedInviteData.cpf === cleanCpf && indexedInviteData.status === 'respondido') throw new Error('AUTOCADASTRO_PENDENTE');
      if (indexedInviteData.cpf !== cleanCpf || indexedInviteData.status !== 'ativo' || !(indexedInviteData.expiraEm instanceof Timestamp)) {
        throw new Error('INDICE_CONVITE_INVALIDO');
      }
      if (indexedInviteData.expiraEm.toMillis() > now.toMillis()) throw new Error('CONVITE_ATIVO_JA_EXISTE');
    }
    transaction.set(conviteRef, convite);
    transaction.set(inviteIndexRef, { inviteId: credentials.id, criadoEm: now, criadoPor: userId });
  });
  return { convite: { id: credentials.id, ...convite }, token: credentials.token, url: credentials.url };
};

export const reissueMemberInvite = async ({ inviteId, userId, origin }, firestore = db) => {
  const credentials = await createInviteCredentials(origin);
  const oldInviteRef = getDataDoc(firestore, 'convites_membro', inviteId);
  const newInviteRef = getDataDoc(firestore, 'convites_membro', credentials.id);
  const now = Timestamp.now();
  const expiraEm = Timestamp.fromDate(getMemberInviteExpiration(now.toDate()));
  let convite;
  await runTransaction(firestore, async transaction => {
    const oldSnapshot = await transaction.get(oldInviteRef);
    if (!oldSnapshot.exists()) throw new Error('CONVITE_INVALIDO');
    const oldInvite = oldSnapshot.data();
    const registrationRef = getDataDoc(firestore, 'autocadastros_membro', inviteId);
    const personIndexRef = getDataDoc(firestore, 'cpf_index', oldInvite.cpf);
    const inviteIndexRef = getDataDoc(firestore, 'convite_membro_cpf_index', oldInvite.cpf);
    const [personIndex, inviteIndex, registration] = await Promise.all([transaction.get(personIndexRef), transaction.get(inviteIndexRef), transaction.get(registrationRef)]);
    if (personIndex.exists()) throw new Error('CPF_DUPLICADO');
    if (oldInvite.status === 'respondido' || registration.exists()) throw new Error('AUTOCADASTRO_PENDENTE');
    if (inviteIndex.exists() && inviteIndex.data().inviteId !== inviteId) throw new Error('CONVITE_ATIVO_JA_EXISTE');
    convite = { nome: oldInvite.nome, cpf: oldInvite.cpf, email: oldInvite.email || null, status: 'ativo', criadoEm: now, criadoPor: userId, expiraEm, atualizadoEm: now, atualizadoPor: userId };
    if (oldSnapshot.data().status === 'ativo') transaction.update(oldInviteRef, { status: 'revogado', revogadoEm: now, revogadoPor: userId, atualizadoEm: now, atualizadoPor: userId });
    transaction.set(newInviteRef, convite);
    transaction.set(inviteIndexRef, { inviteId: credentials.id, criadoEm: now, criadoPor: userId });
  });
  return { convite: { id: credentials.id, ...convite }, token: credentials.token, url: credentials.url };
};

export const getMemberInviteByToken = async (token, firestore = db) => {
  if (!isValidMemberInviteToken(token)) return { status: 'invalido', invite: null };
  const inviteId = await hashMemberInviteToken(token);
  const snapshot = await getDoc(getDataDoc(firestore, 'convites_membro', inviteId));
  if (!snapshot.exists()) return { status: 'invalido', invite: null };
  const invite = { id: inviteId, ...snapshot.data() };
  const status = getMemberInviteEffectiveStatus(invite);
  return status === 'ativo' ? { status, invite } : status === 'respondido' ? { status, invite } : { status: 'invalido', invite: null };
};

export const submitMemberSelfRegistration = async ({ inviteId, data }, firestore = db) => {
  const inviteRef = getDataDoc(firestore, 'convites_membro', inviteId);
  const registrationRef = getDataDoc(firestore, 'autocadastros_membro', inviteId);
  const inviteSnapshot = await getDoc(inviteRef);
  if (!inviteSnapshot.exists()) throw new Error('CONVITE_INDISPONIVEL');
  if (inviteSnapshot.data().status === 'respondido') throw new Error('AUTOCADASTRO_JA_ENVIADO');
  const invite = { id: inviteId, ...inviteSnapshot.data() };
  if (invite.status !== 'ativo' || !(invite.expiraEm instanceof Timestamp) || invite.expiraEm.toMillis() <= Date.now()) throw new Error('CONVITE_INDISPONIVEL');
  if ((data.nome !== undefined && String(data.nome).trim() !== invite.nome) || (data.cpf !== undefined && String(data.cpf) !== invite.cpf)) throw new Error('AUTOCADASTRO_IDENTIDADE_INVALIDA');
  const payload = buildMemberSelfRegistrationPayload(invite, data);
  const validationError = validateMemberSelfRegistrationPayload(payload);
  if (validationError) throw new Error(validationError);
  const batch = writeBatch(firestore);
  batch.set(registrationRef, { ...payload, enviadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
  batch.update(inviteRef, { status: 'respondido', respondidoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
  await batch.commit();
};

const validateRegistrationOrigin = ({ registration, inviteId, invite, inviteIndex }) => {
  if (registration.inviteId !== inviteId || invite.cpf !== registration.cpf || invite.nome !== registration.nome) throw new Error('AUTOCADASTRO_INCONSISTENTE');
  if (invite.status !== 'respondido') throw new Error('CONVITE_INCOMPATIVEL');
  if (!inviteIndex || inviteIndex.inviteId !== inviteId) throw new Error('INDICE_CONVITE_INVALIDO');
};

export const approveMemberSelfRegistration = async ({ inviteId, userId, funcoesCasa = [], dadosCasa }, firestore = db) => {
  const registrationRef = getDataDoc(firestore, 'autocadastros_membro', inviteId);
  const inviteRef = getDataDoc(firestore, 'convites_membro', inviteId);
  const pessoaRef = doc(getDataCollection(firestore, 'pessoas'));
  const auditRef = getDataDoc(firestore, 'auditoria', `autocadastro_aprovado_${inviteId}`);
  const configuredFunctionsSnapshot = await getDocs(getDataCollection(firestore, 'config_funcoes_membro'));
  const allowedFunctionCodes = new Set(getEffectiveMemberFunctions(configuredFunctionsSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))).map(item => item.id));
  const selectedFunctionCodes = [...new Set((funcoesCasa || []).map(value => String(value || '').trim()).filter(Boolean))];
  await runTransaction(firestore, async transaction => {
    const registrationSnapshot = await transaction.get(registrationRef);
    if (!registrationSnapshot.exists()) throw new Error('AUTOCADASTRO_NAO_ENCONTRADO');
    const registration = registrationSnapshot.data();
    if (registration.statusCadastro !== 'aguardando_validacao') throw new Error('AUTOCADASTRO_JA_ANALISADO');
    if (selectedFunctionCodes.length === 0) throw new Error('FUNCAO_CASA_OBRIGATORIA');
    if (selectedFunctionCodes.some(code => !allowedFunctionCodes.has(code))) throw new Error('FUNCAO_CASA_INVALIDA');
    const approvalData = { funcoesCasa: selectedFunctionCodes, dadosCasa: dadosCasa ?? registration.dadosCasa };
    const validationError = validateSelfRegistrationApproval(registration, approvalData);
    if (validationError) throw new Error(validationError);
    const inviteIndexRef = getDataDoc(firestore, 'convite_membro_cpf_index', registration.cpf);
    const cpfIndexRef = getDataDoc(firestore, 'cpf_index', registration.cpf);
    const [inviteSnapshot, inviteIndexSnapshot, cpfIndexSnapshot] = await Promise.all([
      transaction.get(inviteRef), transaction.get(inviteIndexRef), transaction.get(cpfIndexRef)
    ]);
    if (!inviteSnapshot.exists()) throw new Error('CONVITE_INCOMPATIVEL');
    validateRegistrationOrigin({ registration, inviteId, invite: inviteSnapshot.data(), inviteIndex: inviteIndexSnapshot.exists() ? inviteIndexSnapshot.data() : null });
    if (cpfIndexSnapshot.exists()) throw new Error('CPF_DUPLICADO');
    const now = Timestamp.now();
    const pessoa = withPessoaSearchIndex({
      ...buildPessoaFromSelfRegistration(registration, approvalData),
      criadoEm: now, criadoPor: userId, atualizadoEm: now, atualizadoPor: userId,
    });
    transaction.set(pessoaRef, pessoa);
    transaction.set(cpfIndexRef, { pessoaId: pessoaRef.id, criadoEm: now });
    transaction.update(registrationRef, { statusCadastro: 'aprovado', pessoaId: pessoaRef.id, analisadoEm: now, analisadoPor: userId, atualizadoEm: now });
    transaction.delete(inviteIndexRef);
    transaction.set(auditRef, { tipo: 'AUTOCADASTRO_MEMBRO_APROVADO', autocadastroId: inviteId, inviteId, pessoaId: pessoaRef.id, executadoPor: userId, executadoEm: now });
  });
  return { pessoaId: pessoaRef.id };
};

export const rejectMemberSelfRegistration = async ({ inviteId, userId, reason }, firestore = db) => {
  const registrationRef = getDataDoc(firestore, 'autocadastros_membro', inviteId);
  const inviteRef = getDataDoc(firestore, 'convites_membro', inviteId);
  const auditRef = getDataDoc(firestore, 'auditoria', `autocadastro_rejeitado_${inviteId}`);
  await runTransaction(firestore, async transaction => {
    const registrationSnapshot = await transaction.get(registrationRef);
    if (!registrationSnapshot.exists()) throw new Error('AUTOCADASTRO_NAO_ENCONTRADO');
    const registration = registrationSnapshot.data();
    const validationError = validateSelfRegistrationRejection(registration, reason);
    if (validationError) throw new Error(validationError);
    const inviteIndexRef = getDataDoc(firestore, 'convite_membro_cpf_index', registration.cpf);
    const [inviteSnapshot, inviteIndexSnapshot] = await Promise.all([
      transaction.get(inviteRef), transaction.get(inviteIndexRef)
    ]);
    if (!inviteSnapshot.exists()) throw new Error('CONVITE_INCOMPATIVEL');
    validateRegistrationOrigin({ registration, inviteId, invite: inviteSnapshot.data(), inviteIndex: inviteIndexSnapshot.exists() ? inviteIndexSnapshot.data() : null });
    const now = Timestamp.now();
    const motivoRejeicao = normalizeRejectionReason(reason);
    transaction.update(registrationRef, { statusCadastro: 'rejeitado', motivoRejeicao, analisadoEm: now, analisadoPor: userId, atualizadoEm: now });
    transaction.delete(inviteIndexRef);
    transaction.set(auditRef, { tipo: 'AUTOCADASTRO_MEMBRO_REJEITADO', autocadastroId: inviteId, inviteId, executadoPor: userId, executadoEm: now, motivo: motivoRejeicao });
  });
};

export const revokeMemberInvite = async ({ inviteId, userId }, firestore = db) => {
  const inviteRef = getDataDoc(firestore, 'convites_membro', inviteId);
  const now = Timestamp.now();
  await runTransaction(firestore, async transaction => {
    const snapshot = await transaction.get(inviteRef);
    if (!snapshot.exists()) throw new Error('CONVITE_NAO_ENCONTRADO');
    if (snapshot.data().status !== 'ativo') throw new Error('CONVITE_NAO_ATIVO');
    const inviteIndexRef = getDataDoc(firestore, 'convite_membro_cpf_index', snapshot.data().cpf);
    const indexSnapshot = await transaction.get(inviteIndexRef);
    if (!indexSnapshot.exists() || indexSnapshot.data().inviteId !== inviteId) throw new Error('INDICE_CONVITE_INVALIDO');
    transaction.update(inviteRef, { status: 'revogado', revogadoEm: now, revogadoPor: userId, atualizadoEm: now, atualizadoPor: userId });
    transaction.delete(inviteIndexRef);
  });
};

export const rebuildPessoaSearchIndex = async ({ pageSize = 200, cursor = null } = {}, firestore = db) => {
  const effectivePageSize = Math.min(Math.max(1, pageSize), 400);
  const constraints = [orderBy(documentId()), limit(effectivePageSize)];
  if (cursor) constraints.splice(1, 0, startAfter(cursor));
  const snapshot = await getDocs(query(getDataCollection(firestore, 'pessoas'), ...constraints));
  const batch = writeBatch(firestore);
  let updated = 0;
  let correct = 0;
  snapshot.docs.forEach(item => {
    const expected = buildPessoaSearchIndex(item.data());
    if (item.data().busca?.versao === PESSOA_SEARCH_VERSION && JSON.stringify(item.data().busca) === JSON.stringify(expected)) {
      correct += 1;
    } else {
      batch.update(item.ref, { busca: expected });
      updated += 1;
    }
  });
  if (updated) await batch.commit();
  return {
    analyzed: snapshot.size,
    updated,
    correct,
    errors: 0,
    nextCursor: snapshot.size === effectivePageSize ? snapshot.docs.at(-1).id : null
  };
};

const ACCESS_ROLES = ['admin', 'gestor', 'atendimento'];
const isActiveMember = pessoa => pessoa?.ativo !== false && getPessoaVinculo(pessoa) === 'membro';

const linkUserToPessoa = async ({ uid, pessoaBaseId, role = null, executadoPor, requirePending = false }, firestore = db) => {
  if (!uid || !pessoaBaseId || (role !== null && !ACCESS_ROLES.includes(role))) throw new Error('AUTORIZACAO_INVALIDA');
  const userRef = getDataDoc(firestore, 'usuarios', uid);
  const personRef = getDataDoc(firestore, 'pessoas', pessoaBaseId);
  const indexRef = getDataDoc(firestore, 'usuario_pessoa_index', pessoaBaseId);
  const auditRef = getDataDoc(firestore, 'auditoria', `usuario_acesso_${uid}_${pessoaBaseId}`);
  await runTransaction(firestore, async transaction => {
    const [userSnapshot, personSnapshot, indexSnapshot] = await Promise.all([
      transaction.get(userRef), transaction.get(personRef), transaction.get(indexRef)
    ]);
    if (!userSnapshot.exists()) throw new Error('USUARIO_NAO_ENCONTRADO');
    if (!personSnapshot.exists() || !isActiveMember(personSnapshot.data())) throw new Error('PESSOA_NAO_E_MEMBRO_ATIVO');
    const memberEmail = normalizeEmail(personSnapshot.data().email);
    const userEmail = normalizeEmail(userSnapshot.data().email);
    if (!memberEmail) throw new Error('MEMBRO_SEM_EMAIL_ACESSO');
    if (!userEmail || memberEmail !== userEmail) throw new Error('EMAIL_MEMBRO_DIVERGENTE');
    if (requirePending && userSnapshot.data().role !== 'pendente') throw new Error('USUARIO_NAO_PENDENTE');
    if (!requirePending && userSnapshot.data().role === 'pendente') throw new Error('USUARIO_PENDENTE');
    if (indexSnapshot.exists() && indexSnapshot.data().uid !== uid) throw new Error('PESSOA_JA_POSSUI_ACESSO');
    const now = Timestamp.now();
    if (!indexSnapshot.exists()) transaction.set(indexRef, { pessoaBaseId, uid, criadoEm: now, criadoPor: executadoPor });
    transaction.update(userRef, {
      pessoaBaseId,
      ...(role ? { role } : {}),
      ...(requirePending ? { ativo: true } : {}),
      atualizadoEm: now,
      atualizadoPor: executadoPor
    });
    transaction.set(auditRef, {
      tipo: requirePending ? 'USUARIO_AUTORIZADO' : 'USUARIO_VINCULADO', alvoUid: uid,
      pessoaBaseId, ...(role ? { role } : {}), executadoPor, criadoEm: now
    });
  });
};

export const autorizarUsuario = (params, firestore = db) => linkUserToPessoa({ ...params, requirePending: true }, firestore);
export const vincularUsuarioPessoa = (params, firestore = db) => linkUserToPessoa({ ...params, requirePending: false }, firestore);

export const createAccessAuthorization = async ({ pessoaBaseId, role, executadoPor }, firestore = db) => {
  const personRef = getDataDoc(firestore, 'pessoas', pessoaBaseId);
  const indexRef = getDataDoc(firestore, 'usuario_pessoa_index', pessoaBaseId);
  const authorizationRef = getDataDoc(firestore, 'autorizacoes_acesso', pessoaBaseId);
  const auditRef = doc(getDataCollection(firestore, 'auditoria'));
  let createdAuthorization;
  await runTransaction(firestore, async transaction => {
    const [personSnapshot, indexSnapshot, authorizationSnapshot] = await Promise.all([
      transaction.get(personRef), transaction.get(indexRef), transaction.get(authorizationRef)
    ]);
    if (!personSnapshot.exists()) throw new Error('PESSOA_NAO_E_MEMBRO_ATIVO');
    const validation = validateAccessAuthorization({ pessoa: personSnapshot.data(), role });
    if (validation) throw new Error(validation);
    if (indexSnapshot.exists()) throw new Error('PESSOA_JA_POSSUI_ACESSO');
    if (authorizationSnapshot.exists() && authorizationSnapshot.data().status === ACCESS_AUTHORIZATION_STATUS.PENDING) throw new Error('AUTORIZACAO_PENDENTE_JA_EXISTE');
    if (authorizationSnapshot.exists() && authorizationSnapshot.data().status === ACCESS_AUTHORIZATION_STATUS.USED) throw new Error('INDICE_AUTORIZACAO_INVALIDO');
    const now = Timestamp.now();
    const authorization = buildAccessAuthorization({ pessoaId: pessoaBaseId, pessoa: personSnapshot.data(), role, adminUid: executadoPor, auditId: auditRef.id, now });
    createdAuthorization = authorization;
    transaction.set(authorizationRef, authorization);
    transaction.set(auditRef, { tipo: 'USUARIO_ACESSO_PREAUTORIZADO', pessoaBaseId, email: authorization.email, role, executadoPor, criadoEm: now });
  });
  return { pessoaBaseId, email: createdAuthorization.email, role: createdAuthorization.role };
};

export const sendAccessActivationEmail = async ({ email, origin }, authInstance = auth, sendLink = sendSignInLinkToEmail) => {
  if (!authInstance) throw new Error('AUTH_NAO_INICIALIZADO');
  const authorizedEmail = normalizeAccessActivationEmail(email);
  await sendLink(authInstance, authorizedEmail, buildAccessActivationActionCodeSettings(origin));
};

export const resendAccessActivationEmail = async ({ pessoaBaseId, origin }, firestore = db, authInstance = auth, sendLink = sendSignInLinkToEmail) => {
  const [authorizationSnapshot, personSnapshot] = await Promise.all([
    getDoc(getDataDoc(firestore, 'autorizacoes_acesso', pessoaBaseId)),
    getDoc(getDataDoc(firestore, 'pessoas', pessoaBaseId)),
  ]);
  if (!authorizationSnapshot.exists() || authorizationSnapshot.data().status !== ACCESS_AUTHORIZATION_STATUS.PENDING || !personSnapshot.exists()) {
    throw new Error('AUTORIZACAO_NAO_PENDENTE');
  }
  const authorization = authorizationSnapshot.data();
  const personEmail = normalizeAccessActivationEmail(personSnapshot.data().email);
  if (authorization.pessoaBaseId !== pessoaBaseId || normalizeAccessActivationEmail(authorization.email) !== personEmail) {
    throw new Error('AUTORIZACAO_INCONSISTENTE');
  }
  await sendAccessActivationEmail({ email: authorization.email, origin }, authInstance, sendLink);
};

export const sendUserPasswordReset = async ({ email }, authInstance = auth, sendReset = sendPasswordResetEmail) => {
  if (!authInstance) throw new Error('AUTH_NAO_INICIALIZADO');
  await sendReset(authInstance, normalizeAccessActivationEmail(email));
};

export const cancelAccessAuthorization = async ({ pessoaBaseId, executadoPor }, firestore = db) => {
  const authorizationRef = getDataDoc(firestore, 'autorizacoes_acesso', pessoaBaseId);
  const auditRef = doc(getDataCollection(firestore, 'auditoria'));
  await runTransaction(firestore, async transaction => {
    const snapshot = await transaction.get(authorizationRef);
    if (!snapshot.exists() || snapshot.data().status !== ACCESS_AUTHORIZATION_STATUS.PENDING) throw new Error('AUTORIZACAO_NAO_PENDENTE');
    const now = Timestamp.now();
    transaction.update(authorizationRef, { status: ACCESS_AUTHORIZATION_STATUS.CANCELLED, canceladoEm: now, canceladoPor: executadoPor, atualizadoEm: now, atualizadoPor: executadoPor, auditoriaCancelamentoId: auditRef.id });
    transaction.set(auditRef, { tipo: 'USUARIO_ACESSO_AUTORIZACAO_CANCELADA', pessoaBaseId, executadoPor, criadoEm: now });
  });
};

export const claimAuthorizedAccess = async ({ authorizationId, uid, email, emailVerified }, firestore = db) => {
  if (!uid || !emailVerified) throw new Error('ATIVACAO_ACESSO_INVALIDA');
  const authorizationRef = getDataDoc(firestore, 'autorizacoes_acesso', authorizationId);
  const personRef = getDataDoc(firestore, 'pessoas', authorizationId);
  const userRef = getDataDoc(firestore, 'usuarios', uid);
  const indexRef = getDataDoc(firestore, 'usuario_pessoa_index', authorizationId);
  const auditRef = getDataDoc(firestore, 'auditoria', `usuario_ativado_${uid}_${authorizationId}`);
  await runTransaction(firestore, async transaction => {
    const [authorizationSnapshot, personSnapshot, userSnapshot, indexSnapshot] = await Promise.all([
      transaction.get(authorizationRef), transaction.get(personRef), transaction.get(userRef), transaction.get(indexRef)
    ]);
    if (!authorizationSnapshot.exists() || authorizationSnapshot.data().status !== ACCESS_AUTHORIZATION_STATUS.PENDING) throw new Error('ATIVACAO_ACESSO_INVALIDA');
    const authorization = authorizationSnapshot.data();
    if (authorization.pessoaBaseId !== authorizationId || normalizeEmail(authorization.email) !== normalizeEmail(email)) throw new Error('ATIVACAO_ACESSO_INVALIDA');
    if (!personSnapshot.exists() || validateAccessAuthorization({ pessoa: personSnapshot.data(), role: authorization.role })) throw new Error('ATIVACAO_ACESSO_INVALIDA');
    if (normalizeEmail(personSnapshot.data().email) !== authorization.email || userSnapshot.exists() || indexSnapshot.exists()) throw new Error('ATIVACAO_ACESSO_INVALIDA');
    const now = Timestamp.now();
    transaction.set(userRef, buildAuthorizedUser({ uid, pessoa: personSnapshot.data(), authorization, now }));
    transaction.set(indexRef, { pessoaBaseId: authorizationId, uid, criadoEm: now, criadoPor: uid });
    transaction.update(authorizationRef, { status: ACCESS_AUTHORIZATION_STATUS.USED, utilizadoEm: now, utilizadoPorUid: uid, atualizadoEm: now, atualizadoPor: uid });
    transaction.set(auditRef, { tipo: 'USUARIO_ACESSO_ATIVADO', alvoUid: uid, pessoaBaseId: authorizationId, role: authorization.role, autorizadoPor: authorization.criadoPor, executadoPor: uid, criadoEm: now });
  });
};

export const findAndClaimAuthorizedAccess = async ({ uid, email, emailVerified }, firestore = db) => {
  if (!uid || !emailVerified || !normalizeEmail(email)) return false;
  const authorizationQuery = query(getDataCollection(firestore, 'autorizacoes_acesso'), where('email', '==', normalizeEmail(email)), where('status', '==', ACCESS_AUTHORIZATION_STATUS.PENDING), limit(2));
  const snapshot = await getDocs(authorizationQuery);
  if (snapshot.empty) return false;
  if (snapshot.size !== 1) throw new Error('MULTIPLAS_AUTORIZACOES_ACESSO');
  await claimAuthorizedAccess({ authorizationId: snapshot.docs[0].id, uid, email, emailVerified }, firestore);
  return true;
};

export const getMyRegistration = async ({ uid }, firestore = db) => {
  if (!uid) throw new Error('USUARIO_INVALIDO');
  const userSnapshot = await getDoc(getDataDoc(firestore, 'usuarios', uid));
  if (!userSnapshot.exists() || userSnapshot.data().ativo === false) throw new Error('USUARIO_SEM_ACESSO');
  const pessoaBaseId = userSnapshot.data().pessoaBaseId;
  if (!pessoaBaseId) return null;
  const personSnapshot = await getDoc(getDataDoc(firestore, 'pessoas', pessoaBaseId));
  if (!personSnapshot.exists()) throw new Error('CADASTRO_NAO_ENCONTRADO');
  return { id: personSnapshot.id, ...personSnapshot.data() };
};

export const updateMyRegistration = async ({ uid, data }, firestore = db) => {
  if (!uid) throw new Error('USUARIO_INVALIDO');
  const userRef = getDataDoc(firestore, 'usuarios', uid);
  const auditRef = doc(getDataCollection(firestore, 'auditoria'));
  let changedFields = [];
  await runTransaction(firestore, async transaction => {
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists() || userSnapshot.data().ativo === false) throw new Error('USUARIO_SEM_ACESSO');
    const pessoaBaseId = userSnapshot.data().pessoaBaseId;
    if (!pessoaBaseId) throw new Error('USUARIO_SEM_PESSOA');
    const personRef = getDataDoc(firestore, 'pessoas', pessoaBaseId);
    const personSnapshot = await transaction.get(personRef);
    if (!personSnapshot.exists()) throw new Error('CADASTRO_NAO_ENCONTRADO');
    const current = personSnapshot.data();
    const update = buildMyRegistrationUpdate(current, data);
    changedFields = update.fields;
    if (!changedFields.length) return;
    const now = Timestamp.now();
    transaction.update(personRef, withPessoaSearchIndex({ ...current, ...update.data, atualizadoEm: now, atualizadoPor: uid }));
    transaction.set(auditRef, { tipo: 'MEU_CADASTRO_ATUALIZADO', pessoaBaseId, camposAlterados: changedFields, executadoPor: uid, criadoEm: now });
  });
  return { camposAlterados: changedFields };
};

export const setMemberLifecycle = async ({ pessoaBaseId, ativo, motivo, executadoPor }, firestore = db) => {
  if (!pessoaBaseId || !executadoPor || typeof ativo !== 'boolean') throw new Error('LIFECYCLE_INVALIDO');
  const reason = ativo ? null : requireLifecycleReason(motivo);
  const personRef = getDataDoc(firestore, 'pessoas', pessoaBaseId);
  const executorRef = getDataDoc(firestore, 'usuarios', executadoPor);
  const auditRef = doc(getDataCollection(firestore, 'auditoria'));
  await runTransaction(firestore, async transaction => {
    const [personSnapshot, executorSnapshot] = await Promise.all([transaction.get(personRef), transaction.get(executorRef)]);
    if (!personSnapshot.exists()) throw new Error('PESSOA_NAO_ENCONTRADA');
    if (!executorSnapshot.exists() || executorSnapshot.data().role !== 'admin' || executorSnapshot.data().ativo === false) throw new Error('ADMIN_OBRIGATORIO');
    if (executorSnapshot.data().pessoaBaseId === pessoaBaseId) throw new Error('AUTO_INATIVACAO_PROIBIDA');
    const person = personSnapshot.data();
    if ((person.ativo !== false) === ativo) throw new Error('SITUACAO_JA_APLICADA');
    const now = Timestamp.now();
    const auditType = ativo ? LIFECYCLE_AUDIT_TYPES.MEMBER_REACTIVATED : LIFECYCLE_AUDIT_TYPES.MEMBER_DEACTIVATED;
    transaction.update(personRef, {
      ativo,
      ...(ativo
        ? { reativadoEm: now, reativadoPor: executadoPor }
        : { inativadoEm: now, inativadoPor: executadoPor, motivoInativacao: reason }),
      auditoriaLifecycleId: auditRef.id,
      atualizadoEm: now,
      atualizadoPor: executadoPor,
    });
    transaction.set(auditRef, { tipo: auditType, pessoaBaseId, ...(reason ? { motivo: reason } : {}), executadoPor, criadoEm: now });
  });
};

export const setUserAccessLifecycle = async ({ alvoUid, ativo, motivo, executadoPor }, firestore = db) => {
  if (!alvoUid || !executadoPor || typeof ativo !== 'boolean') throw new Error('LIFECYCLE_INVALIDO');
  if (alvoUid === executadoPor) throw new Error('AUTO_REVOGACAO_PROIBIDA');
  const reason = ativo ? null : requireLifecycleReason(motivo);
  const targetRef = getDataDoc(firestore, 'usuarios', alvoUid);
  const executorRef = getDataDoc(firestore, 'usuarios', executadoPor);
  const auditRef = doc(getDataCollection(firestore, 'auditoria'));
  await runTransaction(firestore, async transaction => {
    const [targetSnapshot, executorSnapshot] = await Promise.all([transaction.get(targetRef), transaction.get(executorRef)]);
    if (!targetSnapshot.exists()) throw new Error('USUARIO_NAO_ENCONTRADO');
    if (!executorSnapshot.exists() || executorSnapshot.data().role !== 'admin' || executorSnapshot.data().ativo === false) throw new Error('ADMIN_OBRIGATORIO');
    const target = targetSnapshot.data();
    if (!['admin', 'gestor', 'atendimento'].includes(target.role)) throw new Error('ROLE_INSTITUCIONAL_INVALIDA');
    if ((target.ativo !== false) === ativo) throw new Error('SITUACAO_JA_APLICADA');
    if (ativo && target.pessoaBaseId) {
      const personSnapshot = await transaction.get(getDataDoc(firestore, 'pessoas', target.pessoaBaseId));
      if (!personSnapshot.exists() || personSnapshot.data().ativo === false) throw new Error('MEMBRO_INATIVO');
    }
    const now = Timestamp.now();
    const auditType = ativo ? LIFECYCLE_AUDIT_TYPES.ACCESS_REACTIVATED : LIFECYCLE_AUDIT_TYPES.ACCESS_REVOKED;
    transaction.update(targetRef, {
      ativo,
      ...(ativo
        ? { acessoReativadoEm: now, acessoReativadoPor: executadoPor }
        : { acessoRevogadoEm: now, acessoRevogadoPor: executadoPor, motivoRevogacao: reason }),
      auditoriaLifecycleId: auditRef.id,
      atualizadoEm: now,
      atualizadoPor: executadoPor,
    });
    transaction.set(auditRef, { tipo: auditType, alvoUid, ...(target.pessoaBaseId ? { pessoaBaseId: target.pessoaBaseId } : {}), ...(reason ? { motivo: reason } : {}), executadoPor, criadoEm: now });
  });
};

export const createAgendamento = async ({ agenda, pessoa, servicos, userId, status, horaChegada = null, requireFuture = false, requireActivePessoa = false }, firestore = db) => {
  if (requireFuture && agenda.data?.toDate?.().getTime() < Date.now()) throw new Error('AGENDA_INDISPONIVEL');
  if (['Concluída', 'Cancelada'].includes(agenda.status)) throw new Error('AGENDA_INDISPONIVEL');
  const permittedTypes = getAgendaPublicosPermitidos(agenda);
  if (permittedTypes.length && !permittedTypes.includes(getPessoaVinculo(pessoa))) throw new Error('PUBLICO_NAO_PERMITIDO');
  servicos.forEach(service => {
    if (!agendaAceitaServico(agenda, service.id)) throw new Error(`SERVICO_NAO_DISPONIVEL:${service.nome}`);
    if (!servicoAtivoNaAgenda(agenda, service.id)) throw new Error(`SERVICO_CANCELADO:${service.nome}`);
  });
  const existingQuery = query(getDataCollection(firestore, 'consulentes'), where('agendaId', '==', agenda.id));
  const existingSnapshot = await getDocs(existingQuery);
  const activeAppointments = existingSnapshot.docs.map(item => item.data()).filter(item => !['Cancelado', 'Reagendado'].includes(item.status));
  if (activeAppointments.some(item => item.pessoaBaseId === pessoa.id)) throw new Error('AGENDAMENTO_DUPLICADO');

  const realOccupancy = {};
  activeAppointments.forEach(item => getServicosAtivosAtendimento(item).forEach(serviceId => {
    realOccupancy[serviceId] = (realOccupancy[serviceId] || 0) + 1;
  }));

  const agendaRef = getDataDoc(firestore, 'agendas', agenda.id);
  const pessoaRef = requireActivePessoa ? getDataDoc(firestore, 'pessoas', pessoa.id) : null;
  const appointmentRef = doc(getDataCollection(firestore, 'consulentes'));
  const activeRef = getDataDoc(firestore, 'agendamentos_ativos', `${agenda.id}_${pessoa.id}`);
  await runTransaction(firestore, async transaction => {
    const [agendaSnapshot, activeSnapshot, pessoaSnapshot] = await Promise.all([transaction.get(agendaRef), transaction.get(activeRef), pessoaRef ? transaction.get(pessoaRef) : null]);
    if (!agendaSnapshot.exists()) throw new Error('AGENDA_NAO_ENCONTRADA');
    if (['Concluída', 'Cancelada'].includes(agendaSnapshot.data().status)) throw new Error('AGENDA_INDISPONIVEL');
    if (activeSnapshot.exists()) throw new Error('AGENDAMENTO_DUPLICADO');
    if (requireActivePessoa && (!pessoaSnapshot?.exists() || pessoaSnapshot.data().ativo === false)) throw new Error('PESSOA_INATIVA');

    const agendaData = agendaSnapshot.data();
    if (agendaData.ativo === false || (requireFuture && agendaData.data?.toDate?.().getTime() < Date.now())) throw new Error('AGENDA_INDISPONIVEL');
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
    transaction.set(activeRef, {
      agendaId: agenda.id, pessoaBaseId: pessoa.id, agendamentoId: appointmentRef.id,
      criadoEm: now, criadoPor: userId
    });
    transaction.update(agendaRef, { vagasOcupadas: occupied, atualizadoEm: now, atualizadoPor: userId });
  });
  return appointmentRef.id;
};

export const createConsulenteQuick = ({ data, userId }, firestore = db) => createPessoa({
  data: { ...data, vinculo: 'consulente', tipoPessoa: 'Consulente', funcoesCasa: [] }, userId
}, firestore);

export const getPessoaByCpf = async (cpf, firestore = db) => {
  const normalizedCpf = normalizeSearchDigits(cpf);
  if (!normalizedCpf || !firestore) return null;
  const indexSnapshot = await getDoc(getDataDoc(firestore, 'cpf_index', normalizedCpf));
  if (!indexSnapshot.exists()) return null;
  return getPessoaById(indexSnapshot.data().pessoaId, firestore);
};

export const createProgramacaoLote = async ({ trabalho, servicos, horario, publicosPermitidos, vagasTotais, dates, userId }, firestore = db) => {
  const uniqueDates = [...new Set((dates || []).filter(Boolean))].sort();
  if (!trabalho?.id || !servicos?.length || !horario || !uniqueDates.length) throw new Error('PROGRAMACAO_INVALIDA');
  if (uniqueDates.length > 400) throw new Error('LIMITE_PROGRAMACAO_EXCEDIDO');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (uniqueDates.some(date => new Date(`${date}T12:00:00`) < today)) throw new Error('PROGRAMACAO_DATA_PASSADA');
  const refs = uniqueDates.map(date => getDataDoc(firestore, 'agendas', getAgendaSchedulingKey({
    tipoTrabalhoId: trabalho.id, date, horario, servicosIds: servicos.map(item => item.id), publicosPermitidos
  })));
  await runTransaction(firestore, async transaction => {
    const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
    const conflicts = snapshots.flatMap((snapshot, index) => snapshot.exists() ? [uniqueDates[index]] : []);
    if (conflicts.length) throw new Error(`PROGRAMACAO_DUPLICADA:${conflicts.join(',')}`);
    const now = Timestamp.now();
    const names = Object.fromEntries(servicos.map(item => [item.id, item.nome]));
    const statuses = Object.fromEntries(servicos.map(item => [item.id, 'Ativo']));
    const totals = Object.fromEntries(servicos.filter(servicoControlaVagas).map(item => [item.id, Number(vagasTotais?.[item.id] || 0)]));
    refs.forEach((ref, index) => transaction.set(ref, {
      tipoTrabalhoId: trabalho.id, tipoTrabalhoNome: trabalho.nome, tipo: trabalho.nome,
      data: Timestamp.fromDate(new Date(`${uniqueDates[index]}T${horario}:00`)), horario,
      publicosPermitidos, servicosIds: servicos.map(item => item.id), servicosNomes: names,
      servicosStatus: statuses, vagasTotais: totals,
      vagasOcupadas: Object.fromEntries(Object.keys(totals).map(id => [id, 0])),
      programacaoChave: ref.id, status: 'Agendada', ativo: true,
      criadoEm: now, criadoPor: userId, atualizadoEm: now, atualizadoPor: userId
    }));
  });
  return refs.map(ref => ref.id);
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
    const activeRef = getDataDoc(firestore, 'agendamentos_ativos', `${agendaId}_${appointment.pessoaBaseId}`);
    const activeSnapshot = await transaction.get(activeRef);

    const occupied = { ...(agendaData.vagasOcupadas || {}) };
    getServicosAtivosAtendimento(appointment).forEach(serviceId => {
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
    if (activeSnapshot.exists() && activeSnapshot.data().agendamentoId === agendamentoId) transaction.delete(activeRef);
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

const isPastAgenda = agenda => {
  const date = agenda?.data?.toDate?.() || (agenda?.data instanceof Date ? agenda.data : null);
  if (!date) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
};

export const realocarAtendimento = async ({
  origemAgendaId, origemAgendamentoId, destinoAgendaId, servicosIds, motivo, userId, role
}, firestore = db) => {
  const cleanReason = motivo?.trim();
  if (!['admin', 'gestor'].includes(role)) throw new Error('PERMISSAO_NEGADA');
  if (!cleanReason) throw new Error('MOTIVO_OBRIGATORIO');
  if (!origemAgendaId || !destinoAgendaId || origemAgendaId === destinoAgendaId) throw new Error('DESTINO_INVALIDO');
  const selectedIds = [...new Set(servicosIds || [])];
  if (!selectedIds.length) throw new Error('SERVICO_NAO_DISPONIVEL');
  if (selectedIds.length > 3) throw new Error('LIMITE_SERVICOS_REALOCACAO');

  const originAgendaRef = getDataDoc(firestore, 'agendas', origemAgendaId);
  const originAppointmentRef = getDataDoc(firestore, 'consulentes', origemAgendamentoId);
  const destinationAgendaRef = getDataDoc(firestore, 'agendas', destinoAgendaId);
  const destinationAppointmentRef = doc(getDataCollection(firestore, 'consulentes'));
  const realocacaoRef = doc(getDataCollection(firestore, 'auditoria'));
  const realocacaoId = realocacaoRef.id;

  await runTransaction(firestore, async transaction => {
    const [originAgendaSnapshot, originAppointmentSnapshot, destinationAgendaSnapshot] = await Promise.all([
      transaction.get(originAgendaRef), transaction.get(originAppointmentRef), transaction.get(destinationAgendaRef)
    ]);
    if (!originAgendaSnapshot.exists() || !originAppointmentSnapshot.exists()) throw new Error('REGISTRO_NAO_ENCONTRADO');
    if (!destinationAgendaSnapshot.exists()) throw new Error('DESTINO_INVALIDO');

    const originAgenda = originAgendaSnapshot.data();
    const origin = originAppointmentSnapshot.data();
    const destinationAgenda = destinationAgendaSnapshot.data();
    if (origin.agendaId !== origemAgendaId) throw new Error('DESTINO_INVALIDO');
    if (origin.status !== 'Agendado') throw new Error('STATUS_NAO_REALOCAVEL');
    if (['Concluída', 'Cancelada'].includes(destinationAgenda.status) || isPastAgenda(destinationAgenda)) throw new Error('AGENDA_DESTINO_INDISPONIVEL');

    const activeIds = getServicosAtivosAtendimento(origin);
    selectedIds.forEach(serviceId => {
      if ((origin.servicosRealocados || {})[serviceId]) throw new Error('SERVICO_JA_REALOCADO');
      if (!activeIds.includes(serviceId) || !agendaAceitaServico(destinationAgenda, serviceId)) throw new Error('SERVICO_NAO_DISPONIVEL');
      if (!servicoAtivoNaAgenda(destinationAgenda, serviceId)) throw new Error('SERVICO_CANCELADO');
    });

    const personRef = getDataDoc(firestore, 'pessoas', origin.pessoaBaseId);
    const originLockRef = getDataDoc(firestore, 'agendamentos_ativos', `${origemAgendaId}_${origin.pessoaBaseId}`);
    const destinationLockRef = getDataDoc(firestore, 'agendamentos_ativos', `${destinoAgendaId}_${origin.pessoaBaseId}`);
    const [personSnapshot, originLockSnapshot, destinationLockSnapshot] = await Promise.all([
      transaction.get(personRef), transaction.get(originLockRef), transaction.get(destinationLockRef)
    ]);
    if (destinationLockSnapshot.exists()) throw new Error('DESTINO_POSSUI_ATENDIMENTO');
    const person = personSnapshot.exists() ? personSnapshot.data() : origin;
    const destinationPersonName = getNomePessoaAtendimento(person, origin);
    if (!destinationPersonName) throw new Error('PESSOA_SEM_NOME');
    const permittedTypes = getAgendaPublicosPermitidos(destinationAgenda);
    if (permittedTypes.length && !permittedTypes.includes(getPessoaVinculo(person))) throw new Error('PUBLICO_NAO_PERMITIDO');

    const destinationOccupied = { ...(destinationAgenda.vagasOcupadas || {}) };
    selectedIds.forEach(serviceId => {
      if (Object.hasOwn(destinationAgenda.vagasTotais || {}, serviceId)) {
        const total = Number(destinationAgenda.vagasTotais[serviceId] || 0);
        const current = Number(destinationOccupied[serviceId] || 0);
        if (current >= total) throw new Error(`SEM_VAGA:${serviceId}`);
        destinationOccupied[serviceId] = current + 1;
      }
    });

    const complete = selectedIds.length === activeIds.length;
    const now = Timestamp.now();
    const serviceNames = selectedIds.map(id => {
      const historicalName = getNomeServicoAtendimento(origin, id);
      return historicalName !== id ? historicalName : destinationAgenda.servicosNomes?.[id] || id;
    });
    const relocationInfo = Object.fromEntries(selectedIds.map(id => [id, {
      realocacaoId,
      destinoAgendaId, destinoAgendamentoId: destinationAppointmentRef.id,
      realocadoEm: now, realocadoPor: userId, motivo: cleanReason
    }]));
    const originChanges = {
      status: complete ? 'Reagendado' : 'Agendado',
      ultimaRealocacaoId: realocacaoId,
      servicosRealocados: { ...(origin.servicosRealocados || {}), ...relocationInfo },
      atualizadoEm: now, atualizadoPor: userId
    };
    if (complete) Object.assign(originChanges, {
      reagendadoEm: now, reagendadoPor: userId, reagendadoParaAgendaId: destinoAgendaId,
      reagendadoParaAgendamentoId: destinationAppointmentRef.id, motivoRealocacao: cleanReason
    });
    transaction.update(originAppointmentRef, originChanges);

    if (originAgenda.status !== 'Cancelada') {
      const originOccupied = { ...(originAgenda.vagasOcupadas || {}) };
      selectedIds.forEach(serviceId => {
        if (Object.hasOwn(originAgenda.vagasTotais || {}, serviceId)) {
          originOccupied[serviceId] = Math.max(0, Number(originOccupied[serviceId] || 0) - 1);
        }
      });
      transaction.update(originAgendaRef, { vagasOcupadas: originOccupied, atualizadoEm: now, atualizadoPor: userId });
    }

    transaction.set(destinationAppointmentRef, {
      agendaId: destinoAgendaId, nome: destinationPersonName, pessoaBaseId: origin.pessoaBaseId,
      cpf: origin.cpf || '', status: 'Agendado', servicosIds: selectedIds, servicosNomes: serviceNames,
      criadoEm: now, criadoPor: userId, atualizadoEm: now, atualizadoPor: userId, prioridade: false,
      origemRealocacao: {
        realocacaoId,
        agendaId: origemAgendaId, agendamentoId: origemAgendamentoId,
        tipo: complete ? 'completa' : 'parcial', realocadoEm: now, realocadoPor: userId, motivo: cleanReason
      }
    });
    transaction.update(destinationAgendaRef, { vagasOcupadas: destinationOccupied, atualizadoEm: now, atualizadoPor: userId });
    transaction.set(destinationLockRef, {
      agendaId: destinoAgendaId, pessoaBaseId: origin.pessoaBaseId,
      agendamentoId: destinationAppointmentRef.id, criadoEm: now, criadoPor: userId
    });
    if (complete && originLockSnapshot.exists() && originLockSnapshot.data().agendamentoId === origemAgendamentoId) {
      transaction.delete(originLockRef);
    }
    transaction.set(realocacaoRef, {
      tipo: complete ? 'ATENDIMENTO_REAGENDADO' : 'SERVICO_REALOCADO',
      realocacaoId,
      origemAgendaId, origemAgendamentoId, destinoAgendaId,
      destinoAgendamentoId: destinationAppointmentRef.id, servicosIds: selectedIds,
      motivo: cleanReason, executadoPor: userId, criadoEm: now
    });
  });
  return destinationAppointmentRef.id;
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

const CORRECOES_STATUS_PERMITIDAS = {
  'Concluído': ['Presente', 'Agendado'],
  Presente: ['Agendado'],
  Faltou: ['Agendado']
};

export const corrigirStatusAtendimento = async ({ agendaId, agendamentoId, status, motivo, userId }, firestore = db) => {
  const cleanReason = motivo?.trim();
  if (!cleanReason) throw new Error('MOTIVO_OBRIGATORIO');
  const agendaRef = getDataDoc(firestore, 'agendas', agendaId);
  const appointmentRef = getDataDoc(firestore, 'consulentes', agendamentoId);
  await runTransaction(firestore, async transaction => {
    const [agendaSnapshot, appointmentSnapshot] = await Promise.all([transaction.get(agendaRef), transaction.get(appointmentRef)]);
    if (!agendaSnapshot.exists() || !appointmentSnapshot.exists()) throw new Error('REGISTRO_NAO_ENCONTRADO');
    if (agendaSnapshot.data().status === 'Cancelada') throw new Error('AGENDA_INDISPONIVEL');
    const current = appointmentSnapshot.data();
    if (!(CORRECOES_STATUS_PERMITIDAS[current.status] || []).includes(status)) throw new Error('CORRECAO_STATUS_INVALIDA');
    const now = Timestamp.now();
    const changes = { status, atualizadoEm: now, atualizadoPor: userId };
    if (current.status === 'Concluído') changes.horaSaida = deleteField();
    if (status === 'Agendado' && ['Concluído', 'Presente'].includes(current.status)) changes.horaChegada = deleteField();
    transaction.update(appointmentRef, changes);
    transaction.set(createAuditRef(firestore), {
      tipo: 'STATUS_ATENDIMENTO_CORRIGIDO', agendaId, alvoId: agendamentoId, agendamentoId,
      statusAnterior: current.status, statusNovo: status, motivo: cleanReason, executadoPor: userId, criadoEm: now
    });
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
  const affected = appointments.filter(item => !['Cancelado', 'Reagendado'].includes(item.status) && getServicosAtivosAtendimento(item).includes(servicoId)).length;
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
  const appointments = await getAgendaAppointments(firestore, agendaId);
  if (appointments.some(item => ['Presente', 'Concluído'].includes(item.status))) {
    throw new Error('AGENDA_POSSUI_ATENDIMENTO_EXECUTADO');
  }
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
  isSignInWithEmailLink,
  sendEmailVerification,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updatePassword,
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
  limit,
  orderBy,
  deleteField
};
