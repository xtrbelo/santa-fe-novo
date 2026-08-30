import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  GoogleAuthProvider, 
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  updateProfile
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
import { buildPessoaPayload, isValidEmail, normalizeEmail, validatePessoaPayload } from '../utils/pessoaForm.js';
import { buildMemberInviteUrl, generateMemberInviteToken, getMemberInviteExpiration, hashMemberInviteToken } from '../utils/memberInvite.js';
import { validateCPF } from '../utils/formatters.js';

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
  const useAllFirebaseEmulators = import.meta.env?.DEV === true
    && getEnv('VITE_USE_FIREBASE_EMULATORS', 'false') === 'true';
  const useFirestoreEmulator = import.meta.env?.DEV === true
    && (useAllFirebaseEmulators || getEnv('VITE_USE_FIRESTORE_EMULATOR', 'false') === 'true');
  if (useAllFirebaseEmulators && !globalThis.__santaFeAuthEmulatorConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    globalThis.__santaFeAuthEmulatorConnected = true;
  }
  if (useFirestoreEmulator && !globalThis.__santaFeFirestoreEmulatorConnected) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    globalThis.__santaFeFirestoreEmulatorConnected = true;
  }
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
    if (inviteIndex.exists()) throw new Error('CONVITE_ATIVO_JA_EXISTE');
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
    const personIndexRef = getDataDoc(firestore, 'cpf_index', oldInvite.cpf);
    const inviteIndexRef = getDataDoc(firestore, 'convite_membro_cpf_index', oldInvite.cpf);
    const [personIndex, inviteIndex] = await Promise.all([transaction.get(personIndexRef), transaction.get(inviteIndexRef)]);
    if (personIndex.exists()) throw new Error('CPF_DUPLICADO');
    if (inviteIndex.exists() && inviteIndex.data().inviteId !== inviteId) throw new Error('CONVITE_ATIVO_JA_EXISTE');
    convite = { nome: oldInvite.nome, cpf: oldInvite.cpf, email: oldInvite.email || null, status: 'ativo', criadoEm: now, criadoPor: userId, expiraEm, atualizadoEm: now, atualizadoPor: userId };
    if (oldSnapshot.data().status === 'ativo') transaction.update(oldInviteRef, { status: 'revogado', revogadoEm: now, revogadoPor: userId, atualizadoEm: now, atualizadoPor: userId });
    transaction.set(newInviteRef, convite);
    transaction.set(inviteIndexRef, { inviteId: credentials.id, criadoEm: now, criadoPor: userId });
  });
  return { convite: { id: credentials.id, ...convite }, token: credentials.token, url: credentials.url };
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
  const activeAppointments = existingSnapshot.docs.map(item => item.data()).filter(item => !['Cancelado', 'Reagendado'].includes(item.status));
  if (activeAppointments.some(item => item.pessoaBaseId === pessoa.id)) throw new Error('AGENDAMENTO_DUPLICADO');

  const realOccupancy = {};
  activeAppointments.forEach(item => getServicosAtivosAtendimento(item).forEach(serviceId => {
    realOccupancy[serviceId] = (realOccupancy[serviceId] || 0) + 1;
  }));

  const agendaRef = getDataDoc(firestore, 'agendas', agenda.id);
  const appointmentRef = doc(getDataCollection(firestore, 'consulentes'));
  const activeRef = getDataDoc(firestore, 'agendamentos_ativos', `${agenda.id}_${pessoa.id}`);
  await runTransaction(firestore, async transaction => {
    const [agendaSnapshot, activeSnapshot] = await Promise.all([transaction.get(agendaRef), transaction.get(activeRef)]);
    if (!agendaSnapshot.exists()) throw new Error('AGENDA_NAO_ENCONTRADA');
    if (['Concluída', 'Cancelada'].includes(agendaSnapshot.data().status)) throw new Error('AGENDA_INDISPONIVEL');
    if (activeSnapshot.exists()) throw new Error('AGENDAMENTO_DUPLICADO');

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
    transaction.set(activeRef, {
      agendaId: agenda.id, pessoaBaseId: pessoa.id, agendamentoId: appointmentRef.id,
      criadoEm: now, criadoPor: userId
    });
    transaction.update(agendaRef, { vagasOcupadas: occupied, atualizadoEm: now, atualizadoPor: userId });
  });
  return appointmentRef.id;
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
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
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
