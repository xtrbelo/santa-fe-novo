import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import {
  appId,
  cancelAgendamento,
  concluirAgenda,
  createAgendamento,
  createConsulenteQuick,
  createProgramacaoLote,
  setAgendamentoPrioridade,
  updateAtendimentoStatus,
  editarAgenda,
  cancelarServicoAgenda,
  cancelarAgenda,
  excluirAgendaVazia,
  corrigirStatusAtendimento,
  realocarAtendimento,
  rebuildPessoaSearchIndex,
  searchPessoas,
  withPessoaSearchIndex,
  createPessoa,
  createMemberInvite,
  getMemberInviteByToken,
  reissueMemberInvite,
  revokeMemberInvite,
  submitMemberSelfRegistration,
  approveMemberSelfRegistration,
  rejectMemberSelfRegistration,
  autorizarUsuario,
  vincularUsuarioPessoa,
  cancelAccessAuthorization,
  createAccessAuthorization,
  findAndClaimAuthorizedAccess,
  resendAccessActivationEmail,
  getMyRegistration,
  updateMyRegistration,
  setMemberLifecycle,
  setUserAccessLifecycle
} from '../src/services/firebase.js';
import { sortQueue } from '../src/utils/formatters.js';
import { getAgendaPublicosPermitidos, getNomePessoaAtendimento, getNomeServicoAtendimento, getPessoaFuncoesCasa, getPessoaVinculo, getServicosAtivosAtendimento, isAtendimentoFluxoDia, isAtendimentoOperacional, servicoControlaVagas, servicoPertenceAoTrabalho } from '../src/utils/domain.js';

const PROJECT_ID = 'santa-fe-business-test';
const root = `artifacts/${appId}/public/data`;
const USER_ID = 'admin-business';
const service = { id: 'servico-a', nome: 'Serviço A', requerVagas: true };
const serviceB = { id: 'servico-b', nome: 'Serviço B', requerVagas: true };
const person = (id, tipoPessoa = 'Consulente') => ({ id, nome: `Pessoa ${id}`, tipoPessoa });
const path = (collectionName, id) => `${root}/${collectionName}/${id}`;

let environment;
const adminDb = () => environment.authenticatedContext(USER_ID, { email_verified: true }).firestore();
const gestorDb = () => environment.authenticatedContext('gestor-business', { email_verified: true }).firestore();
const publicDb = () => environment.unauthenticatedContext().firestore();
const accessDb = (uid, email, emailVerified = true) => environment.authenticatedContext(uid, { email, email_verified: emailVerified }).firestore();

async function seedDocuments(entries) {
  await environment.withSecurityRulesDisabled(async context => {
    await Promise.all(entries.map(([collectionName, id, data]) => setDoc(doc(context.firestore(), path(collectionName, id)), data)));
  });
}

async function seedAgenda(id = 'agenda-1', overrides = {}) {
  const agenda = {
    id,
    tipo: 'Agenda de teste',
    status: 'Aberta',
    tiposPessoaPermitidos: ['Consulente'],
    vagasTotais: { [service.id]: 2 },
    vagasOcupadas: { [service.id]: 0 },
    ...overrides
  };
  const { id: agendaId, ...storedAgenda } = agenda;
  await seedDocuments([['agendas', agendaId, storedAgenda]]);
  return agenda;
}

const appointmentRef = (db, agendaId, personId) => doc(db, path('consulentes', `${agendaId}_${personId}`));
const appointmentById = (db, id) => doc(db, path('consulentes', id));
const activeRef = (db, agendaId, personId) => doc(db, path('agendamentos_ativos', `${agendaId}_${personId}`));
const agendaRef = (db, agendaId) => doc(db, path('agendas', agendaId));
const book = (db, agenda, selectedPerson) => createAgendamento({ agenda, pessoa: selectedPerson, servicos: [service], userId: USER_ID, status: 'Agendado' }, db);

before(async () => {
  environment = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});

describe('Fase 10A - programação em lote', () => {
  test('cria documentos independentes e bloqueia repetição da mesma programação', async () => {
    const db = adminDb();
    const params = { trabalho: { id: 'trabalho-10a', nome: 'Atendimento 10A' }, servicos: [service], horario: '19:00', publicosPermitidos: ['consulente'], vagasTotais: { [service.id]: 3 }, dates: ['2035-06-10', '2035-06-11'], userId: USER_ID };
    const ids = await createProgramacaoLote(params, db);
    assert.equal(ids.length, 2); assert.notEqual(ids[0], ids[1]);
    const stored = await Promise.all(ids.map(id => getDoc(agendaRef(db, id))));
    assert.equal(stored.every(snapshot => snapshot.exists()), true);
    assert.equal(stored[0].data().vagasOcupadas[service.id], 0);
    await assert.rejects(createProgramacaoLote(params, db), error => error.message === 'PROGRAMACAO_DUPLICADA:2035-06-10,2035-06-11');
  });
});

describe('Fase 10A - cadastro rápido de consulente', () => {
  test('Atendimento cria Consulente ativo com índices e nunca cria Membro ou usuário', async () => {
    await seedDocuments([['usuarios', 'atendimento-10a', { uid: 'atendimento-10a', email: 'atendimento@local.test', role: 'atendimento', ativo: true }]]);
    const db = accessDb('atendimento-10a', 'atendimento@local.test');
    const created = await createConsulenteQuick({ data: { nome: 'Consulente Rápida', cpf: '52998224725', contato: '11999999999', vinculo: 'membro', funcoesCasa: ['medium'] }, userId: 'atendimento-10a' }, db);
    const stored = (await getDoc(doc(db, path('pessoas', created.id)))).data();
    assert.equal(stored.ativo, true); assert.equal(stored.vinculo, 'consulente'); assert.equal(stored.tipoPessoa, 'Consulente'); assert.deepEqual(stored.funcoesCasa, []);
    assert.equal((await getDoc(doc(db, path('cpf_index', '52998224725')))).data().pessoaId, created.id);
    assert.ok(stored.busca.termos.includes('consulente rapida'));
    assert.equal((await getDocs(collection(adminDb(), `${root}/usuarios`))).size, 3);
  });

  test('CPF duplicado não cria outra Pessoa e usuário sem permissão não cadastra', async () => {
    await seedDocuments([['usuarios', 'atendimento-10a', { uid: 'atendimento-10a', email: 'atendimento@local.test', role: 'atendimento', ativo: true }], ['usuarios', 'sem-permissao-10a', { uid: 'sem-permissao-10a', email: 'pendente@local.test', role: 'pendente', ativo: true }]]);
    const db = accessDb('atendimento-10a', 'atendimento@local.test');
    const params = { data: { nome: 'Única', cpf: '11144477735' }, userId: 'atendimento-10a' };
    await createConsulenteQuick(params, db);
    await assert.rejects(createConsulenteQuick(params, db), /CPF_DUPLICADO/);
    assert.equal((await getDocs(collection(db, `${root}/pessoas`))).size, 1);
    await assert.rejects(createConsulenteQuick({ data: { nome: 'Bloqueada', cpf: '39053344705' }, userId: 'sem-permissao-10a' }, accessDb('sem-permissao-10a', 'pendente@local.test')), error => error.code === 'permission-denied' || error.code === 'firestore/permission-denied');
  });
});

describe('Fase 8A - autorização e vínculo de acesso', () => {
  test('autoriza pendente de forma atômica com membro, índice e auditoria', async () => {
    const db = adminDb();
    await seedDocuments([
      ['usuarios', 'pendente-8a', { uid: 'pendente-8a', email: 'joao@email.com', role: 'pendente', ativo: true }],
      ['pessoas', 'membro-8a', { nome: 'Membro Oito', email: 'joao@email.com', vinculo: 'membro', ativo: true }]
    ]);
    await autorizarUsuario({ uid: 'pendente-8a', pessoaBaseId: 'membro-8a', role: 'atendimento', executadoPor: USER_ID }, db);
    const usuario = (await getDoc(doc(db, path('usuarios', 'pendente-8a')))).data();
    assert.equal(usuario.role, 'atendimento'); assert.equal(usuario.pessoaBaseId, 'membro-8a'); assert.equal(usuario.email, 'joao@email.com');
    assert.equal((await getDoc(doc(db, path('usuario_pessoa_index', 'membro-8a')))).data().uid, 'pendente-8a');
    assert.equal((await getDoc(doc(db, path('auditoria', 'usuario_acesso_pendente-8a_membro-8a')))).data().tipo, 'USUARIO_AUTORIZADO');
  });
  test('recusa consulente, membro inativo e vínculo duplicado', async () => {
    const db = adminDb();
    await seedDocuments([
      ['usuarios', 'pendente-a', { uid: 'pendente-a', email: 'unico@email.com', role: 'pendente', ativo: true }],
      ['usuarios', 'pendente-b', { uid: 'pendente-b', email: 'unico@email.com', role: 'pendente', ativo: true }],
      ['pessoas', 'consulente-8a', { nome: 'Consulente', vinculo: 'consulente', ativo: true }],
      ['pessoas', 'inativo-8a', { nome: 'Inativo', vinculo: 'membro', ativo: false }],
      ['pessoas', 'membro-unico', { nome: 'Membro', email: 'unico@email.com', vinculo: 'membro', ativo: true }]
    ]);
    await assert.rejects(autorizarUsuario({ uid: 'pendente-a', pessoaBaseId: 'consulente-8a', role: 'atendimento', executadoPor: USER_ID }, db), /PESSOA_NAO_E_MEMBRO_ATIVO/);
    await assert.rejects(autorizarUsuario({ uid: 'pendente-a', pessoaBaseId: 'inativo-8a', role: 'atendimento', executadoPor: USER_ID }, db), /PESSOA_NAO_E_MEMBRO_ATIVO/);
    await autorizarUsuario({ uid: 'pendente-a', pessoaBaseId: 'membro-unico', role: 'gestor', executadoPor: USER_ID }, db);
    await assert.rejects(autorizarUsuario({ uid: 'pendente-b', pessoaBaseId: 'membro-unico', role: 'atendimento', executadoPor: USER_ID }, db), /PESSOA_JA_POSSUI_ACESSO/);
  });
  test('recusa e-mail divergente e membro sem e-mail para acesso', async () => {
    const db = adminDb();
    await seedDocuments([
      ['usuarios', 'pendente-email', { uid: 'pendente-email', email: 'conta@email.com', role: 'pendente', ativo: true }],
      ['pessoas', 'membro-divergente', { nome: 'Divergente', email: 'outro@email.com', vinculo: 'membro', ativo: true }],
      ['pessoas', 'membro-sem-email', { nome: 'Sem e-mail', vinculo: 'membro', ativo: true }]
    ]);
    await assert.rejects(autorizarUsuario({ uid: 'pendente-email', pessoaBaseId: 'membro-divergente', role: 'atendimento', executadoPor: USER_ID }, db), /EMAIL_MEMBRO_DIVERGENTE/);
    await assert.rejects(autorizarUsuario({ uid: 'pendente-email', pessoaBaseId: 'membro-sem-email', role: 'atendimento', executadoPor: USER_ID }, db), /MEMBRO_SEM_EMAIL_ACESSO/);
  });
  test('admin legado vincula a si mesmo sem alterar role ou status', async () => {
    const db = adminDb();
    await seedDocuments([['pessoas', 'membro-admin', { nome: 'Admin Membro', email: 'admin@santafe.local', tipoPessoa: 'Membro', ativo: true }]]);
    await vincularUsuarioPessoa({ uid: USER_ID, pessoaBaseId: 'membro-admin', executadoPor: USER_ID }, db);
    const usuario = (await getDoc(doc(db, path('usuarios', USER_ID)))).data();
    assert.equal(usuario.role, 'admin'); assert.equal(usuario.ativo, true); assert.equal(usuario.pessoaBaseId, 'membro-admin');
  });
});

describe('Fase 9F - autorização institucional de acesso', () => {
  const pessoaId = 'membro-9f'; const email = 'membro.9f@example.test';
  const seedMember = () => seedDocuments([['pessoas', pessoaId, { nome: 'Membro Nove F', email, vinculo: 'membro', ativo: true }]]);

  test('Admin pré-autoriza e Google correto consome tudo atomicamente', async () => {
    await seedMember();
    await createAccessAuthorization({ pessoaBaseId: pessoaId, role: 'gestor', executadoPor: USER_ID }, adminDb());
    assert.equal((await getDoc(doc(adminDb(), path('autorizacoes_acesso', pessoaId)))).data().status, 'pendente');
    const claimed = await findAndClaimAuthorizedAccess({ uid: 'google-9f', email, emailVerified: true }, accessDb('google-9f', email));
    assert.equal(claimed, true);
    const usuario = (await getDoc(doc(accessDb('google-9f', email), path('usuarios', 'google-9f')))).data();
    assert.equal(usuario.nome, 'Membro Nove F'); assert.equal(usuario.role, 'gestor'); assert.equal(usuario.autorizadoPor, USER_ID);
    assert.equal((await getDoc(doc(adminDb(), path('usuario_pessoa_index', pessoaId)))).data().uid, 'google-9f');
    assert.equal((await getDoc(doc(adminDb(), path('autorizacoes_acesso', pessoaId)))).data().status, 'utilizado');
    assert.equal((await getDoc(doc(adminDb(), path('auditoria', `usuario_ativado_google-9f_${pessoaId}`)))).data().tipo, 'USUARIO_ACESSO_ATIVADO');
  });

  test('Google errado ou autorização cancelada não cria usuário nem índice', async () => {
    await seedMember();
    await createAccessAuthorization({ pessoaBaseId: pessoaId, role: 'atendimento', executadoPor: USER_ID }, adminDb());
    assert.equal(await findAndClaimAuthorizedAccess({ uid: 'errado-9f', email: 'errado@example.test', emailVerified: true }, accessDb('errado-9f', 'errado@example.test')), false);
    await cancelAccessAuthorization({ pessoaBaseId: pessoaId, executadoPor: USER_ID }, adminDb());
    assert.equal(await findAndClaimAuthorizedAccess({ uid: 'cancelado-9f', email, emailVerified: true }, accessDb('cancelado-9f', email)), false);
    assert.equal((await getDoc(doc(adminDb(), path('usuario_pessoa_index', pessoaId)))).exists(), false);
  });

  test('reenvio usa somente o e-mail da autorização pendente e recusa cancelada ou utilizada', async () => {
    await seedMember();
    await createAccessAuthorization({ pessoaBaseId: pessoaId, role: 'atendimento', executadoPor: USER_ID }, adminDb());
    const sent = [];
    await resendAccessActivationEmail({ pessoaBaseId: pessoaId, origin: 'https://sistema.example' }, adminDb(), {}, async (_auth, targetEmail, settings) => sent.push({ targetEmail, settings }));
    assert.deepEqual(sent, [{ targetEmail: email, settings: { url: 'https://sistema.example/ativar-acesso', handleCodeInApp: true } }]);
    await cancelAccessAuthorization({ pessoaBaseId: pessoaId, executadoPor: USER_ID }, adminDb());
    await assert.rejects(resendAccessActivationEmail({ pessoaBaseId: pessoaId, origin: 'https://sistema.example' }, adminDb(), {}, async () => {}), /AUTORIZACAO_NAO_PENDENTE/);

    const usedId = `${pessoaId}-utilizada`;
    await seedDocuments([
      ['pessoas', usedId, { nome: 'Membro Utilizado', email: 'utilizado@example.test', vinculo: 'membro', ativo: true }],
      ['autorizacoes_acesso', usedId, { pessoaBaseId: usedId, email: 'utilizado@example.test', role: 'gestor', status: 'utilizado' }],
    ]);
    await assert.rejects(resendAccessActivationEmail({ pessoaBaseId: usedId, origin: 'https://sistema.example' }, adminDb(), {}, async () => {}), /AUTORIZACAO_NAO_PENDENTE/);
  });

  test('dois claims concorrentes permitem somente um usuário por Pessoa', async () => {
    await seedMember();
    await createAccessAuthorization({ pessoaBaseId: pessoaId, role: 'atendimento', executadoPor: USER_ID }, adminDb());
    const attempts = await Promise.allSettled([
      findAndClaimAuthorizedAccess({ uid: 'concorrente-a', email, emailVerified: true }, accessDb('concorrente-a', email)),
      findAndClaimAuthorizedAccess({ uid: 'concorrente-b', email, emailVerified: true }, accessDb('concorrente-b', email))
    ]);
    assert.equal(attempts.filter(item => item.status === 'fulfilled' && item.value === true).length, 1);
    const index = (await getDoc(doc(adminDb(), path('usuario_pessoa_index', pessoaId)))).data();
    assert.ok(['concorrente-a', 'concorrente-b'].includes(index.uid));
    const users = await Promise.all(['concorrente-a', 'concorrente-b'].map(uid => getDoc(doc(adminDb(), path('usuarios', uid)))));
    assert.equal(users.filter(item => item.exists()).length, 1);
  });

  test('perfil existente e pendente legado continuam fora do claim novo', async () => {
    await seedDocuments([['usuarios', 'existente-9f', { uid: 'existente-9f', email, role: 'atendimento', ativo: true }], ['usuarios', 'pendente-9f', { uid: 'pendente-9f', email, role: 'pendente', ativo: true }]]);
    assert.equal((await getDoc(doc(accessDb('existente-9f', email), path('usuarios', 'existente-9f')))).data().role, 'atendimento');
    assert.equal((await getDoc(doc(accessDb('pendente-9f', email), path('usuarios', 'pendente-9f')))).data().role, 'pendente');
  });
});

describe('Fase 9G - Meu Cadastro', () => {
  const uid = 'atendimento-9g';
  const pessoaId = 'membro-9g';
  const email = 'membro.9g@example.test';
  const db = () => accessDb(uid, email);
  const address = { cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null };

  async function seedLinkedUser() {
    await seedDocuments([
      ['usuarios', uid, { uid, email, role: 'atendimento', ativo: true, pessoaBaseId: pessoaId }],
      ['pessoas', pessoaId, { nome: 'Membro Nove G', cpf: '12345678900', email, vinculo: 'membro', tipoPessoa: 'Membro', funcoesCasa: ['medium'], dadosCasa: {}, ativo: true, estadoCivil: 'nao_informado', contato: null, endereco: address }]
    ]);
  }

  test('lê somente a Pessoa indicada pelo perfil autenticado', async () => {
    await seedLinkedUser();
    const cadastro = await getMyRegistration({ uid }, db());
    assert.equal(cadastro.id, pessoaId);
    assert.equal(cadastro.nome, 'Membro Nove G');
  });

  test('salva campos permitidos, atualiza busca e registra auditoria sem dados pessoais', async () => {
    await seedLinkedUser();
    const result = await updateMyRegistration({ uid, data: {
      contato: '(11) 99999-9999', estadoCivil: 'casado',
      endereco: { cep: '01001-000', logradouro: 'Praça da Sé', numero: '1', complemento: '', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' }
    } }, db());
    assert.ok(result.camposAlterados.includes('contato'));
    assert.ok(result.camposAlterados.includes('endereco.cep'));
    const saved = (await getDoc(doc(db(), path('pessoas', pessoaId)))).data();
    assert.equal(saved.contato, '11999999999');
    assert.equal(saved.estadoCivil, 'casado');
    assert.equal(saved.nome, 'Membro Nove G');
    assert.ok(saved.busca.termos.includes('11999999999'));
    assert.equal(saved.atualizadoPor, uid);
    const audits = (await getDocs(collection(adminDb(), `${root}/auditoria`))).docs.map(item => item.data()).filter(item => item.tipo === 'MEU_CADASTRO_ATUALIZADO');
    assert.equal(audits.length, 1);
    assert.deepEqual(Object.keys(audits[0]).sort(), ['camposAlterados', 'criadoEm', 'executadoPor', 'pessoaBaseId', 'tipo']);
    assert.equal(JSON.stringify(audits[0]).includes('11999999999'), false);
  });

  test('rejeita campos protegidos e pessoaBaseId arbitrário', async () => {
    await seedLinkedUser();
    const base = { contato: null, estadoCivil: 'nao_informado', endereco: address };
    for (const field of ['nome', 'cpf', 'email', 'vinculo', 'funcoesCasa', 'dadosCasa', 'ativo', 'pessoaBaseId']) {
      await assert.rejects(updateMyRegistration({ uid, data: { ...base, [field]: 'fraude' } }, db()), /CAMPOS_INVALIDOS/);
    }
  });

  test('usuário legado sem pessoaBaseId recebe estado sem cadastro e não cria vínculo', async () => {
    const legacyUid = 'legado-9g';
    const legacyDb = accessDb(legacyUid, 'legado.9g@example.test');
    await seedDocuments([['usuarios', legacyUid, { uid: legacyUid, email: 'legado.9g@example.test', role: 'gestor', ativo: true }]]);
    assert.equal(await getMyRegistration({ uid: legacyUid }, legacyDb), null);
    await assert.rejects(updateMyRegistration({ uid: legacyUid, data: { contato: null, estadoCivil: 'nao_informado', endereco: address } }, legacyDb), /USUARIO_SEM_PESSOA/);
  });
});

describe('Fase 9H - inativação, histórico e revogação', () => {
  const pessoaId = 'membro-9h';
  const targetUid = 'usuario-9h';
  const seedLifecycle = () => seedDocuments([
    ['pessoas', pessoaId, { nome: 'Membro Nove H', cpf: '12345678900', vinculo: 'membro', tipoPessoa: 'Membro', funcoesCasa: ['medium'], dadosCasa: { dataIngresso: '2020-01-01' }, statusCadastro: 'aprovado', ativo: true }],
    ['usuarios', targetUid, { uid: targetUid, email: 'membro.9h@example.test', role: 'atendimento', ativo: true, pessoaBaseId: pessoaId }],
    ['usuario_pessoa_index', pessoaId, { uid: targetUid, pessoaBaseId: pessoaId }]
  ]);

  test('inativa e reativa Membro preservando histórico e auditando', async () => {
    await seedLifecycle();
    await setMemberLifecycle({ pessoaBaseId: pessoaId, ativo: false, motivo: ' Afastamento institucional ', executadoPor: USER_ID }, adminDb());
    let member = (await getDoc(doc(adminDb(), path('pessoas', pessoaId)))).data();
    assert.equal(member.ativo, false); assert.equal(member.statusCadastro, 'aprovado'); assert.deepEqual(member.funcoesCasa, ['medium']); assert.deepEqual(member.dadosCasa, { dataIngresso: '2020-01-01' });
    await setMemberLifecycle({ pessoaBaseId: pessoaId, ativo: true, executadoPor: USER_ID }, adminDb());
    member = (await getDoc(doc(adminDb(), path('pessoas', pessoaId)))).data();
    assert.equal(member.ativo, true); assert.equal(member.motivoInativacao, 'Afastamento institucional');
    const events = (await getDocs(collection(adminDb(), `${root}/auditoria`))).docs.map(item => item.data()).filter(item => item.pessoaBaseId === pessoaId && item.tipo.startsWith('MEMBRO_'));
    assert.deepEqual(events.map(item => item.tipo).sort(), ['MEMBRO_INATIVADO', 'MEMBRO_REATIVADO']);
  });

  test('motivo é obrigatório e Admin não inativa a própria Pessoa', async () => {
    await seedLifecycle();
    await assert.rejects(setMemberLifecycle({ pessoaBaseId: pessoaId, ativo: false, motivo: '', executadoPor: USER_ID }, adminDb()), /MOTIVO_OBRIGATORIO/);
    await seedDocuments([['usuarios', USER_ID, { uid: USER_ID, email: 'admin@santafe.local', role: 'admin', ativo: true, pessoaBaseId: pessoaId }]]);
    await assert.rejects(setMemberLifecycle({ pessoaBaseId: pessoaId, ativo: false, motivo: 'Fraude', executadoPor: USER_ID }, adminDb()), /AUTO_INATIVACAO_PROIBIDA/);
  });

  test('revoga e reativa acesso preservando role, vínculo e índice', async () => {
    await seedLifecycle();
    await setUserAccessLifecycle({ alvoUid: targetUid, ativo: false, motivo: 'Revogação institucional', executadoPor: USER_ID }, adminDb());
    let target = (await getDoc(doc(adminDb(), path('usuarios', targetUid)))).data();
    assert.equal(target.ativo, false); assert.equal(target.role, 'atendimento'); assert.equal(target.pessoaBaseId, pessoaId);
    assert.equal((await getDoc(doc(adminDb(), path('usuario_pessoa_index', pessoaId)))).exists(), true);
    await setUserAccessLifecycle({ alvoUid: targetUid, ativo: true, executadoPor: USER_ID }, adminDb());
    target = (await getDoc(doc(adminDb(), path('usuarios', targetUid)))).data();
    assert.equal(target.ativo, true); assert.equal(target.motivoRevogacao, 'Revogação institucional');
  });

  test('não reativa acesso com Pessoa inativa e suporta usuário legado', async () => {
    await seedLifecycle();
    await setUserAccessLifecycle({ alvoUid: targetUid, ativo: false, motivo: 'Revogação', executadoPor: USER_ID }, adminDb());
    await setMemberLifecycle({ pessoaBaseId: pessoaId, ativo: false, motivo: 'Afastamento', executadoPor: USER_ID }, adminDb());
    await assert.rejects(setUserAccessLifecycle({ alvoUid: targetUid, ativo: true, executadoPor: USER_ID }, adminDb()), /MEMBRO_INATIVO/);
    await seedDocuments([['usuarios', 'legado-9h', { uid: 'legado-9h', role: 'gestor', ativo: true }]]);
    await setUserAccessLifecycle({ alvoUid: 'legado-9h', ativo: false, motivo: 'Revogação', executadoPor: USER_ID }, adminDb());
    await setUserAccessLifecycle({ alvoUid: 'legado-9h', ativo: true, executadoPor: USER_ID }, adminDb());
    assert.equal((await getDoc(doc(adminDb(), path('usuarios', 'legado-9h')))).data().ativo, true);
  });
});

describe('Fase 9A - cadastro institucional de Membro', () => {
  test('cria Membro canônico sem e-mail e mantém acesso condicionado a e-mail', async () => {
    const db = adminDb();
    const membro = await createPessoa({ data: { vinculo: 'membro', nome: 'Membro Institucional', cpf: '98765432100', email: '', sexo: 'outro', estadoCivil: 'nao_informado', endereco: { cep: '68900000', cidade: 'Macapá', uf: 'AP' }, dadosCasa: { dataIngresso: '2024-01-10' }, funcoesCasa: ['medium'] }, userId: USER_ID }, db);
    const saved = (await getDoc(doc(db, path('pessoas', membro.id)))).data();
    assert.equal(saved.email, null); assert.equal(saved.statusCadastro, 'aprovado'); assert.equal(saved.origemCadastro, 'administrativo'); assert.equal(saved.endereco.uf, 'AP');
    await seedDocuments([['usuarios', 'pendente-9a', { uid: 'pendente-9a', email: 'membro@example.test', role: 'pendente', ativo: true }]]);
    await assert.rejects(autorizarUsuario({ uid: 'pendente-9a', pessoaBaseId: membro.id, role: 'atendimento', executadoPor: USER_ID }, db), /MEMBRO_SEM_EMAIL_ACESSO/);
  });
});

describe('Fase 9B - convite individual de Membro', () => {
  test('Admin cria somente convite e índice ativo, sem Pessoa ou cpf_index', async () => {
    const result = await createMemberInvite({ nome: ' Maria Convidada ', cpf: '529.982.247-25', email: ' MARIA@EXAMPLE.TEST ', userId: USER_ID, origin: 'https://santa-fe-v2.web.app' }, adminDb());
    const convite = (await getDoc(doc(adminDb(), path('convites_membro', result.convite.id)))).data();
    const inviteIndex = (await getDoc(doc(adminDb(), path('convite_membro_cpf_index', '52998224725')))).data();
    assert.equal(convite.nome, 'Maria Convidada'); assert.equal(convite.cpf, '52998224725'); assert.equal(convite.email, 'maria@example.test'); assert.equal(convite.status, 'ativo');
    assert.equal(inviteIndex.inviteId, result.convite.id);
    assert.equal((await getDocs(collection(adminDb(), `${root}/pessoas`))).empty, true);
    assert.equal((await getDoc(doc(adminDb(), path('cpf_index', '52998224725')))).exists(), false);
    assert.equal(Object.hasOwn(convite, 'token'), false); assert.equal(Object.hasOwn(convite, 'url'), false); assert.equal(JSON.stringify(convite).includes(result.token), false);
    assert.match(result.url, /^https:\/\/santa-fe-v2\.web\.app\/autocadastro\?token=/);
  });

  test('Gestor cria convite com e-mail opcional', async () => {
    const result = await createMemberInvite({ nome: 'Sem E-mail', cpf: '168.995.350-09', email: '', userId: 'gestor-business', origin: 'http://localhost:5173' }, gestorDb());
    assert.equal((await getDoc(doc(gestorDb(), path('convites_membro', result.convite.id)))).data().email, null);
  });

  test('CPF de Pessoa existente bloqueia convite sem novas escritas', async () => {
    await seedDocuments([['cpf_index', '11144477735', { pessoaId: 'existente', criadoEm: new Date() }]]);
    await assert.rejects(createMemberInvite({ nome: 'Duplicada', cpf: '11144477735', userId: USER_ID, origin: 'http://localhost' }, adminDb()), /CPF_DUPLICADO/);
    const convites = await getDocs(collection(adminDb(), `${root}/convites_membro`));
    assert.equal(convites.empty, true); assert.equal((await getDocs(collection(adminDb(), `${root}/convite_membro_cpf_index`))).empty, true);
  });

  test('segundo convite ativo para o mesmo CPF é bloqueado', async () => {
    await createMemberInvite({ nome: 'Primeiro', cpf: '11144477735', userId: USER_ID, origin: 'http://localhost' }, adminDb());
    await assert.rejects(createMemberInvite({ nome: 'Segundo', cpf: '11144477735', userId: USER_ID, origin: 'http://localhost' }, adminDb()), /CONVITE_ATIVO_JA_EXISTE/);
    assert.equal((await getDocs(collection(adminDb(), `${root}/convites_membro`))).size, 1);
  });

  test('convite expirado permite novo convite, troca o indice e preserva o historico', async () => {
    const cpf = '39053344705';
    const expiredInviteId = 'e'.repeat(64);
    await seedDocuments([
      ['convites_membro', expiredInviteId, { nome: 'Expirado', cpf, email: null, status: 'ativo', criadoEm: new Date(Date.now() - 8 * 86400000), criadoPor: USER_ID, expiraEm: new Date(Date.now() - 1000), atualizadoEm: new Date(Date.now() - 8 * 86400000), atualizadoPor: USER_ID }],
      ['convite_membro_cpf_index', cpf, { inviteId: expiredInviteId, criadoEm: new Date(Date.now() - 8 * 86400000), criadoPor: USER_ID }]
    ]);
    const created = await createMemberInvite({ nome: 'Novo convite', cpf, userId: USER_ID, origin: 'http://localhost' }, adminDb());
    assert.equal((await getDoc(doc(adminDb(), path('convite_membro_cpf_index', cpf)))).data().inviteId, created.convite.id);
    const expiredInvite = await getDoc(doc(adminDb(), path('convites_membro', expiredInviteId)));
    assert.equal(expiredInvite.exists(), true);
    assert.equal(expiredInvite.data().status, 'ativo');
    assert.equal((await getDocs(collection(adminDb(), `${root}/convites_membro`))).size, 2);
  });

  test('indice inconsistente nao e sobrescrito silenciosamente', async () => {
    const cpf = '39053344705';
    for (const [inviteId, invite] of [
      ['i'.repeat(64), null],
      ['d'.repeat(64), { nome: 'CPF divergente', cpf: '52998224725', email: null, status: 'ativo', criadoEm: new Date(Date.now() - 8 * 86400000), criadoPor: USER_ID, expiraEm: new Date(Date.now() - 1000), atualizadoEm: new Date(Date.now() - 8 * 86400000), atualizadoPor: USER_ID }]
    ]) {
      const entries = [['convite_membro_cpf_index', cpf, { inviteId, criadoEm: new Date(), criadoPor: USER_ID }]];
      if (invite) entries.push(['convites_membro', inviteId, invite]);
      await seedDocuments(entries);
      await assert.rejects(createMemberInvite({ nome: 'Nao sobrescrever', cpf, userId: USER_ID, origin: 'http://localhost' }, adminDb()), /INDICE_CONVITE_INVALIDO/);
      assert.equal((await getDoc(doc(adminDb(), path('convite_membro_cpf_index', cpf)))).data().inviteId, inviteId);
      await environment.clearFirestore();
      await seedDocuments([
        ['usuarios', USER_ID, { uid: USER_ID, email: 'admin@santafe.local', role: 'admin', ativo: true }],
        ['usuarios', 'gestor-business', { uid: 'gestor-business', email: 'gestor@santafe.local', role: 'gestor', ativo: true }]
      ]);
    }
  });

  test('reemissão revoga convite anterior e cria token e hash novos', async () => {
    const first = await createMemberInvite({ nome: 'Reemitir', cpf: '39053344705', userId: USER_ID, origin: 'http://localhost' }, adminDb());
    const second = await reissueMemberInvite({ inviteId: first.convite.id, userId: USER_ID, origin: 'http://localhost' }, adminDb());
    assert.notEqual(second.token, first.token); assert.notEqual(second.convite.id, first.convite.id);
    assert.equal((await getDoc(doc(adminDb(), path('convites_membro', first.convite.id)))).data().status, 'revogado');
    assert.equal((await getDoc(doc(adminDb(), path('convites_membro', second.convite.id)))).data().status, 'ativo');
    assert.equal((await getDoc(doc(adminDb(), path('convite_membro_cpf_index', '39053344705')))).data().inviteId, second.convite.id);
  });

  test('revogação preserva convite, remove índice ativo e não cria Pessoa', async () => {
    const result = await createMemberInvite({ nome: 'Revogar', cpf: '52998224725', userId: USER_ID, origin: 'http://localhost' }, adminDb());
    await revokeMemberInvite({ inviteId: result.convite.id, userId: USER_ID }, adminDb());
    assert.equal((await getDoc(doc(adminDb(), path('convites_membro', result.convite.id)))).data().status, 'revogado');
    assert.equal((await getDoc(doc(adminDb(), path('convite_membro_cpf_index', '52998224725')))).exists(), false);
    assert.equal((await getDocs(collection(adminDb(), `${root}/pessoas`))).empty, true);
  });
});

describe('Fase 9C - autocadastro público de Membro', () => {
  test('token válido localiza somente o convite exato e token inválido é tratado com segurança', async () => {
    const created = await createMemberInvite({ nome: 'Token válido', cpf: '52998224725', userId: USER_ID, origin: 'http://localhost' }, adminDb());
    const valid = await getMemberInviteByToken(created.token, publicDb());
    assert.equal(valid.status, 'ativo'); assert.equal(valid.invite.id, created.convite.id);
    assert.deepEqual(await getMemberInviteByToken('', publicDb()), { status: 'invalido', invite: null });
    assert.deepEqual(await getMemberInviteByToken('token-invalido', publicDb()), { status: 'invalido', invite: null });
  });

  test('envio normaliza dados, cria autocadastro, responde convite e preserva índice sem criar entidades futuras', async () => {
    const created = await createMemberInvite({ nome: 'Futura Membra', cpf: '52998224725', email: 'INICIAL@EXAMPLE.TEST', userId: USER_ID, origin: 'http://localhost' }, adminDb());
    await submitMemberSelfRegistration({ inviteId: created.convite.id, data: { nome: created.convite.nome, cpf: created.convite.cpf, email: ' CORRIGIDO@EXAMPLE.TEST ', contato: ' 96999999999 ', sexo: 'feminino', estadoCivil: 'solteiro', dataNascimento: '1990-01-20', endereco: { cep: '68.900-000', logradouro: ' Rua A ', cidade: ' Macapá ', uf: 'ap' } } }, publicDb());
    const db = adminDb(); const registration = (await getDoc(doc(db, path('autocadastros_membro', created.convite.id)))).data();
    assert.equal(registration.email, 'corrigido@example.test'); assert.equal(registration.contato, '96999999999'); assert.equal(registration.endereco.cep, '68900000'); assert.equal(registration.endereco.uf, 'AP');
    assert.equal(registration.nome, created.convite.nome); assert.equal(registration.cpf, created.convite.cpf); assert.equal(registration.statusCadastro, 'aguardando_validacao'); assert.equal(registration.origemCadastro, 'autocadastro');
    assert.equal((await getDoc(doc(db, path('convites_membro', created.convite.id)))).data().status, 'respondido');
    assert.equal((await getDoc(doc(db, path('convite_membro_cpf_index', created.convite.cpf)))).data().inviteId, created.convite.id);
    for (const collectionName of ['pessoas', 'cpf_index', 'usuarios']) assert.equal((await getDocs(collection(db, `${root}/${collectionName}`))).size, collectionName === 'usuarios' ? 2 : 0);
    for (const forbidden of ['token', 'tokenHash', 'url', 'role', 'pessoaId', 'usuarioId', 'funcoesCasa', 'dadosCasa']) assert.equal(Object.hasOwn(registration, forbidden), false);
  });

  test('autocadastro respondido bloqueia novo convite, reemissão e segundo envio', async () => {
    const created = await createMemberInvite({ nome: 'Pendente', cpf: '39053344705', userId: USER_ID, origin: 'http://localhost' }, adminDb());
    const data = { nome: created.convite.nome, cpf: created.convite.cpf };
    await submitMemberSelfRegistration({ inviteId: created.convite.id, data }, publicDb());
    await assert.rejects(createMemberInvite({ nome: 'Outro', cpf: created.convite.cpf, userId: USER_ID, origin: 'http://localhost' }, adminDb()), /AUTOCADASTRO_PENDENTE/);
    await assert.rejects(reissueMemberInvite({ inviteId: created.convite.id, userId: USER_ID, origin: 'http://localhost' }, adminDb()), /AUTOCADASTRO_PENDENTE/);
    await assert.rejects(submitMemberSelfRegistration({ inviteId: created.convite.id, data }, publicDb()), /AUTOCADASTRO_JA_ENVIADO/);
  });

  test('serviço rejeita identidade adulterada e convite expirado ou revogado', async () => {
    const created = await createMemberInvite({ nome: 'Identidade', cpf: '16899535009', userId: USER_ID, origin: 'http://localhost' }, adminDb());
    await assert.rejects(submitMemberSelfRegistration({ inviteId: created.convite.id, data: { nome: 'Outro', cpf: created.convite.cpf } }, publicDb()), /AUTOCADASTRO_IDENTIDADE_INVALIDA/);
    await seedDocuments([['convites_membro', 'e'.repeat(64), { ...created.convite, status: 'ativo', expiraEm: new Date(Date.now() - 1000) }]]);
    await assert.rejects(submitMemberSelfRegistration({ inviteId: 'e'.repeat(64), data: { nome: created.convite.nome, cpf: created.convite.cpf } }, publicDb()), /CONVITE_INDISPONIVEL|permission-denied/);
    await seedDocuments([['convites_membro', 'r'.repeat(64), { ...created.convite, status: 'revogado' }]]);
    await assert.rejects(submitMemberSelfRegistration({ inviteId: 'r'.repeat(64), data: { nome: created.convite.nome, cpf: created.convite.cpf } }, publicDb()), /CONVITE_INDISPONIVEL|permission-denied/);
  });
});

describe('Fase 9D - análise de autocadastro de Membro', () => {
  const submit = async (db, userId = USER_ID, cpf = '52998224725') => {
    const created = await createMemberInvite({ nome: 'Membra Analisada', cpf, email: 'membra@example.test', userId, origin: 'http://localhost' }, db);
    await submitMemberSelfRegistration({ inviteId: created.convite.id, data: { nome: created.convite.nome, cpf, contato: '96999999999', email: 'membra@example.test', sexo: 'feminino', estadoCivil: 'solteiro', dataNascimento: '1990-01-20', endereco: { cep: '68900000', cidade: 'Macapá', uf: 'AP' } } }, publicDb());
    return created;
  };

  test('Admin aprova atomicamente, cria Membro e índices sem criar usuário', async () => {
    const created = await submit(adminDb());
    const usersBefore = (await getDocs(collection(adminDb(), `${root}/usuarios`))).size;
    const result = await approveMemberSelfRegistration({ inviteId: created.convite.id, userId: USER_ID }, adminDb());
    const pessoa = (await getDoc(doc(adminDb(), path('pessoas', result.pessoaId)))).data();
    const registration = (await getDoc(doc(adminDb(), path('autocadastros_membro', created.convite.id)))).data();
    assert.equal(pessoa.cpf, created.convite.cpf); assert.equal(pessoa.origemCadastro, 'autocadastro'); assert.equal(pessoa.statusCadastro, 'aprovado'); assert.deepEqual(pessoa.funcoesCasa, []);
    assert.equal((await getDoc(doc(adminDb(), path('cpf_index', created.convite.cpf)))).data().pessoaId, result.pessoaId);
    assert.equal(registration.statusCadastro, 'aprovado'); assert.equal(registration.pessoaId, result.pessoaId);
    assert.equal((await getDoc(doc(adminDb(), path('convite_membro_cpf_index', created.convite.cpf)))).exists(), false);
    assert.equal((await getDoc(doc(adminDb(), path('convites_membro', created.convite.id)))).exists(), true);
    assert.equal((await getDoc(doc(adminDb(), path('auditoria', `autocadastro_aprovado_${created.convite.id}`)))).data().tipo, 'AUTOCADASTRO_MEMBRO_APROVADO');
    assert.equal((await getDocs(collection(adminDb(), `${root}/usuarios`))).size, usersBefore);
    await assert.rejects(approveMemberSelfRegistration({ inviteId: created.convite.id, userId: USER_ID }, adminDb()), /AUTOCADASTRO_JA_ANALISADO/);
    await assert.rejects(rejectMemberSelfRegistration({ inviteId: created.convite.id, userId: USER_ID, reason: 'Tentar reverter' }, adminDb()), /AUTOCADASTRO_JA_ANALISADO/);
  });

  test('Gestor rejeita atomicamente, preserva motivo e permite novo convite', async () => {
    const created = await submit(gestorDb(), 'gestor-business', '39053344705');
    await rejectMemberSelfRegistration({ inviteId: created.convite.id, userId: 'gestor-business', reason: ' Dados inconsistentes ' }, gestorDb());
    const registration = (await getDoc(doc(gestorDb(), path('autocadastros_membro', created.convite.id)))).data();
    assert.equal(registration.statusCadastro, 'rejeitado'); assert.equal(registration.motivoRejeicao, 'Dados inconsistentes');
    assert.equal((await getDoc(doc(gestorDb(), path('convite_membro_cpf_index', created.convite.cpf)))).exists(), false);
    assert.equal((await getDocs(collection(gestorDb(), `${root}/pessoas`))).empty, true);
    assert.equal((await getDoc(doc(gestorDb(), path('cpf_index', created.convite.cpf)))).exists(), false);
    const next = await createMemberInvite({ nome: 'Novo convite', cpf: created.convite.cpf, userId: 'gestor-business', origin: 'http://localhost' }, gestorDb());
    assert.ok(next.convite.id);
    await assert.rejects(rejectMemberSelfRegistration({ inviteId: created.convite.id, userId: 'gestor-business', reason: 'Outra decisão' }, gestorDb()), /AUTOCADASTRO_JA_ANALISADO/);
    await assert.rejects(approveMemberSelfRegistration({ inviteId: created.convite.id, userId: 'gestor-business' }, gestorDb()), /AUTOCADASTRO_JA_ANALISADO/);
  });

  test('Gestor também aprova e Admin também rejeita', async () => {
    const gestorRegistration = await submit(gestorDb(), 'gestor-business', '39053344705');
    const approved = await approveMemberSelfRegistration({ inviteId: gestorRegistration.convite.id, userId: 'gestor-business' }, gestorDb());
    assert.equal((await getDoc(doc(gestorDb(), path('pessoas', approved.pessoaId)))).data().criadoPor, 'gestor-business');
    const adminRegistration = await submit(adminDb(), USER_ID, '11144477735');
    await rejectMemberSelfRegistration({ inviteId: adminRegistration.convite.id, userId: USER_ID, reason: 'Cadastro enviado indevidamente' }, adminDb());
    assert.equal((await getDoc(doc(adminDb(), path('autocadastros_membro', adminRegistration.convite.id)))).data().statusCadastro, 'rejeitado');
  });

  test('concorrência permite uma única aprovação e conflito de CPF não deixa escrita parcial', async () => {
    const created = await submit(adminDb(), USER_ID, '16899535009');
    const attempts = await Promise.allSettled([1, 2].map(() => approveMemberSelfRegistration({ inviteId: created.convite.id, userId: USER_ID }, adminDb())));
    assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal((await getDocs(collection(adminDb(), `${root}/pessoas`))).size, 1);
    const conflict = await submit(adminDb(), USER_ID, '11144477735');
    await seedDocuments([['cpf_index', conflict.convite.cpf, { pessoaId: 'concorrente', criadoEm: new Date() }]]);
    await assert.rejects(approveMemberSelfRegistration({ inviteId: conflict.convite.id, userId: USER_ID }, adminDb()), /CPF_DUPLICADO/);
    assert.equal((await getDoc(doc(adminDb(), path('autocadastros_membro', conflict.convite.id)))).data().statusCadastro, 'aguardando_validacao');
    assert.equal((await getDoc(doc(adminDb(), path('convite_membro_cpf_index', conflict.convite.cpf)))).exists(), true);
  });
});

describe('Fase 7A - índice e busca de pessoas', () => {
  test('busca por nome sem acento e telefone não retorna pessoa inativa', async () => {
    const db = adminDb();
    await seedDocuments([
      ['pessoas', 'marcia', withPessoaSearchIndex({ nome: 'Márcia Araújo', contato: '96991234567', ativo: true })],
      ['pessoas', 'inativa', withPessoaSearchIndex({ nome: 'Márcia Inativa', contato: '96990004567', ativo: false })]
    ]);
    assert.deepEqual((await searchPessoas('marcia', {}, db)).map(item => item.id), ['marcia']);
    assert.deepEqual((await searchPessoas('4567', {}, db)).map(item => item.id), ['marcia']);
  });

  test('CPF completo encontra pessoa legada sem índice', async () => {
    const db = adminDb();
    await seedDocuments([['pessoas', 'legada-cpf', { nome: 'Legada', cpf: '12345678900', ativo: true }]]);
    assert.equal((await searchPessoas('123.456.789-00', {}, db))[0].id, 'legada-cpf');
  });

  test('reconstrução cria índice correto e reconhece documento já atualizado', async () => {
    const db = adminDb();
    await seedDocuments([['pessoas', 'sem-indice', { nome: 'João Paulo Belo', cpf: '12345678900', contato: '96991234567', ativo: true }]]);
    const first = await rebuildPessoaSearchIndex({ pageSize: 200 }, db);
    assert.equal(first.updated, 1);
    const saved = (await getDoc(doc(db, path('pessoas', 'sem-indice')))).data();
    assert.ok(saved.busca.termos.includes('joao pa'));
    const second = await rebuildPessoaSearchIndex({ pageSize: 200 }, db);
    assert.equal(second.correct, 1);
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seedDocuments([
    ['usuarios', USER_ID, { uid: USER_ID, email: 'admin@santafe.local', role: 'admin', ativo: true }],
    ['usuarios', 'gestor-business', { uid: 'gestor-business', email: 'gestor@santafe.local', role: 'gestor', ativo: true }]
  ]);
});

after(async () => environment.cleanup());

describe('transações do fluxo operacional', () => {
  test('Fluxo do Dia exibe somente os status operacionais definidos', () => {
    for (const status of ['Agendado', 'Presente', 'Concluído', 'Faltou']) {
      assert.equal(isAtendimentoFluxoDia({ status }), true, `${status} deve aparecer`);
    }
    for (const status of ['Cancelado', 'Reagendado']) {
      assert.equal(isAtendimentoFluxoDia({ status }), false, `${status} deve ficar oculto`);
    }
    assert.equal(isAtendimentoOperacional({ status: 'Cancelado' }), true, 'Cancelado permanece na Agenda administrativa');
  });
  test('reserva vagas até o limite e falha atomicamente com SEM_VAGA', async () => {
    const db = adminDb();
    const agenda = await seedAgenda();
    const firstId = await book(db, agenda, person('1'));
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 1);
    assert.equal((await getDoc(appointmentById(db, firstId))).data().status, 'Agendado');

    await book(db, agenda, person('2'));
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 2);
    await assert.rejects(book(db, agenda, person('3')), /SEM_VAGA/);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 2);
    assert.equal((await getDocs(collection(db, `${root}/consulentes`))).size, 2);
  });

  test('impede agendamento duplicado sem consumir outra vaga', async () => {
    const db = adminDb();
    const agenda = await seedAgenda();
    await book(db, agenda, person('1'));
    await assert.rejects(book(db, agenda, person('1')), /AGENDAMENTO_DUPLICADO/);
    const appointments = await getDocs(collection(db, `${root}/consulentes`));
    assert.equal(appointments.size, 1);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 1);
  });

  test('preserva cancelado, remove lock e cria novo documento ao reagendar', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-reagendamento', { vagasTotais: { [service.id]: 1 } });
    const firstId = await book(db, agenda, person('1'));
    const firstLock = (await getDoc(activeRef(db, agenda.id, '1'))).data();
    assert.equal(firstLock.agendamentoId, firstId);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 1);
    await cancelAgendamento({ agendaId: agenda.id, agendamentoId: firstId, userId: USER_ID }, db);
    assert.equal((await getDoc(appointmentById(db, firstId))).data().status, 'Cancelado');
    assert.equal((await getDoc(activeRef(db, agenda.id, '1'))).exists(), false);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 0);
    const secondId = await book(db, agenda, person('1'));
    assert.notEqual(secondId, firstId);
    const appointments = (await getDocs(collection(db, `${root}/consulentes`))).docs.map(item => ({ id: item.id, ...item.data() }));
    assert.equal(appointments.length, 2);
    assert.equal(appointments.find(item => item.id === firstId).status, 'Cancelado');
    assert.equal(appointments.find(item => item.id === secondId).status, 'Agendado');
    assert.equal((await getDoc(activeRef(db, agenda.id, '1'))).data().agendamentoId, secondId);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 1);
    await assert.rejects(book(db, agenda, person('1')), /AGENDAMENTO_DUPLICADO/);
    assert.equal((await getDocs(collection(db, `${root}/consulentes`))).size, 2);
  });

  test('concorrência da mesma pessoa cria somente um lock e um atendimento', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-lock-concorrente', { vagasTotais: { [service.id]: 2 } });
    const results = await Promise.allSettled([book(db, agenda, person('1')), book(db, agenda, person('1'))]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected' && /AGENDAMENTO_DUPLICADO/.test(result.reason.message)).length, 1);
    assert.equal((await getDocs(collection(db, `${root}/consulentes`))).size, 1);
    assert.equal((await getDoc(activeRef(db, agenda.id, '1'))).exists(), true);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 1);
  });

  test('cancela, devolve vaga e cria auditoria com executor e data', async () => {
    const db = adminDb();
    const agenda = await seedAgenda();
    const appointmentId = await book(db, agenda, person('1'));
    await cancelAgendamento({ agendaId: agenda.id, agendamentoId: appointmentId, userId: USER_ID }, db);

    const canceled = (await getDoc(appointmentById(db, appointmentId))).data();
    assert.equal(canceled.status, 'Cancelado');
    assert.ok(canceled.canceladoEm);
    assert.equal(canceled.canceladoPor, USER_ID);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 0);
    const audit = (await getDocs(collection(db, `${root}/auditoria`))).docs.map(item => item.data()).find(item => item.tipo === 'AGENDAMENTO_CANCELADO');
    assert.equal(audit.executadoPor, USER_ID);
    assert.ok(audit.criadoEm);
  });

  test('segundo cancelamento falha e nunca devolve a vaga duas vezes', async () => {
    const db = adminDb();
    const agenda = await seedAgenda();
    const appointmentId = await book(db, agenda, person('1'));
    const params = { agendaId: agenda.id, agendamentoId: appointmentId, userId: USER_ID };
    await cancelAgendamento(params, db);
    await assert.rejects(cancelAgendamento(params, db), /JA_CANCELADO/);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 0);
  });

  test('não cancela atendimento concluído nem cria auditoria falsa', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-concluido', { vagasOcupadas: { [service.id]: 1 } });
    await seedDocuments([['consulentes', `${agenda.id}_1`, { agendaId: agenda.id, pessoaBaseId: '1', status: 'Concluído', servicosIds: [service.id] }]]);
    await assert.rejects(cancelAgendamento({ agendaId: agenda.id, agendamentoId: `${agenda.id}_1`, userId: USER_ID }, db), /ATENDIMENTO_CONCLUIDO/);
    assert.equal((await getDoc(appointmentRef(db, agenda.id, '1'))).data().status, 'Concluído');
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 1);
    assert.equal((await getDocs(collection(db, `${root}/auditoria`))).size, 0);
  });

  test('conclui agenda, audita e bloqueia reserva, cancelamento e prioridade', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-fechada');
    const appointmentId = await book(db, agenda, person('1'));
    await concluirAgenda({ agendaId: agenda.id, userId: USER_ID }, db);
    const closed = (await getDoc(agendaRef(db, agenda.id))).data();
    assert.equal(closed.status, 'Concluída');
    assert.ok(closed.concluidaEm);
    assert.equal(closed.concluidaPor, USER_ID);
    assert.equal((await getDoc(appointmentById(db, appointmentId))).data().status, 'Agendado');
    await assert.rejects(book(db, { ...agenda, status: 'Concluída' }, person('2')), /AGENDA_INDISPONIVEL/);
    await assert.rejects(cancelAgendamento({ agendaId: agenda.id, agendamentoId: appointmentId, userId: USER_ID }, db), /AGENDA_INDISPONIVEL/);
    await assert.rejects(setAgendamentoPrioridade({ agendaId: agenda.id, agendamentoId: appointmentId, prioridade: true, userId: USER_ID }, db), /AGENDA_INDISPONIVEL/);
    const audit = (await getDocs(collection(db, `${root}/auditoria`))).docs.map(item => item.data()).find(item => item.tipo === 'AGENDA_CONCLUIDA');
    assert.equal(audit.executadoPor, USER_ID);
    assert.ok(audit.criadoEm);
  });

  test('altera prioridade somente para Agendado e Presente e gera auditoria', async () => {
    const db = adminDb();
    for (const status of ['Agendado', 'Presente']) {
      const agenda = await seedAgenda(`agenda-${status}`);
      await seedDocuments([['consulentes', `${agenda.id}_1`, { agendaId: agenda.id, pessoaBaseId: '1', status, prioridade: false }]]);
      await setAgendamentoPrioridade({ agendaId: agenda.id, agendamentoId: `${agenda.id}_1`, prioridade: true, userId: USER_ID }, db);
      assert.equal((await getDoc(appointmentRef(db, agenda.id, '1'))).data().prioridade, true);
    }
    for (const status of ['Concluído', 'Cancelado']) {
      const agenda = await seedAgenda(`agenda-${status}`);
      await seedDocuments([['consulentes', `${agenda.id}_1`, { agendaId: agenda.id, pessoaBaseId: '1', status, prioridade: false }]]);
      await assert.rejects(setAgendamentoPrioridade({ agendaId: agenda.id, agendamentoId: `${agenda.id}_1`, prioridade: true, userId: USER_ID }, db), /STATUS_SEM_PRIORIDADE/);
    }
    const audits = (await getDocs(collection(db, `${root}/auditoria`))).docs.map(item => item.data()).filter(item => item.tipo === 'PRIORIDADE_ALTERADA');
    assert.equal(audits.length, 2);
    assert.ok(audits.every(item => item.executadoPor === USER_ID && item.criadoEm));
    await assertFails(updateDoc((await getDocs(collection(db, `${root}/auditoria`))).docs[0].ref, { valorNovo: false }));
  });

  test('valida tipos permitidos e aceita qualquer tipo quando a lista está vazia', async () => {
    const db = adminDb();
    const restricted = await seedAgenda('agenda-restrita');
    await assert.rejects(book(db, restricted, person('medium', 'Médium')), /PUBLICO_NAO_PERMITIDO/);
    await book(db, restricted, person('consulente'));
    const unrestricted = await seedAgenda('agenda-livre', { tiposPessoaPermitidos: [] });
    await book(db, unrestricted, person('medium', 'Médium'));
  });

  test('considera ocupação real legada maior que o contador salvo', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-legada', { vagasTotais: { [service.id]: 2 }, vagasOcupadas: { [service.id]: 0 } });
    await seedDocuments([
      ['consulentes', 'legado-1', { agendaId: agenda.id, pessoaBaseId: 'legado-1', status: 'Agendado', servicosIds: [service.id] }],
      ['consulentes', 'legado-2', { agendaId: agenda.id, pessoaBaseId: 'legado-2', status: 'Presente', servicosIds: [service.id] }]
    ]);
    await assert.rejects(book(db, agenda, person('3')), /SEM_VAGA/);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 0);
    assert.equal((await getDoc(appointmentRef(db, agenda.id, '3'))).exists(), false);
  });

  test('concorrência concede exatamente uma última vaga', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-concorrente', { vagasTotais: { [service.id]: 1 } });
    const results = await Promise.allSettled([book(db, agenda, person('1')), book(db, agenda, person('2'))]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected' && /SEM_VAGA/.test(result.reason.message)).length, 1);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 1);
    assert.equal((await getDocs(collection(db, `${root}/consulentes`))).size, 1);
  });

  test('ordena fila por status, prioridade e hora de chegada', () => {
    const time = value => ({ toMillis: () => value });
    const queue = [
      { id: 'cancelado', status: 'Cancelado', criadoEm: time(60) },
      { id: 'presente-normal-tarde', status: 'Presente', prioridade: false, horaChegada: time(30) },
      { id: 'faltou', status: 'Faltou', criadoEm: time(50) },
      { id: 'agendado', status: 'Agendado', criadoEm: time(40) },
      { id: 'presente-prioritario-tarde', status: 'Presente', prioridade: true, horaChegada: time(20) },
      { id: 'concluido', status: 'Concluído', criadoEm: time(30) },
      { id: 'presente-prioritario-cedo', status: 'Presente', prioridade: true, horaChegada: time(10) },
      { id: 'presente-normal-cedo', status: 'Presente', prioridade: false, horaChegada: time(5) }
    ];
    assert.deepEqual(queue.sort(sortQueue).map(item => item.id), [
      'presente-prioritario-cedo', 'presente-prioritario-tarde',
      'presente-normal-cedo', 'presente-normal-tarde',
      'agendado', 'concluido', 'faltou', 'cancelado'
    ]);
  });

  test('registra chegada uma vez e não permite sobrescrevê-la', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-chegada');
    const appointmentId = await book(db, agenda, person('1'));
    const params = { agendaId: agenda.id, agendamentoId: appointmentId, status: 'Presente', userId: USER_ID };
    await updateAtendimentoStatus(params, db);
    const original = (await getDoc(appointmentById(db, appointmentId))).data().horaChegada.toMillis();
    await assert.rejects(updateAtendimentoStatus(params, db), /TRANSICAO_INVALIDA/);
    assert.equal((await getDoc(appointmentById(db, appointmentId))).data().horaChegada.toMillis(), original);
  });

  test('registra saída uma vez e protege atendimento concluído', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-saida');
    const appointmentId = await book(db, agenda, person('1'));
    await updateAtendimentoStatus({ agendaId: agenda.id, agendamentoId: appointmentId, status: 'Presente', userId: USER_ID }, db);
    const params = { agendaId: agenda.id, agendamentoId: appointmentId, status: 'Concluído', userId: USER_ID };
    await updateAtendimentoStatus(params, db);
    const original = (await getDoc(appointmentById(db, appointmentId))).data().horaSaida.toMillis();
    await assert.rejects(updateAtendimentoStatus(params, db), /TRANSICAO_INVALIDA/);
    assert.equal((await getDoc(appointmentById(db, appointmentId))).data().horaSaida.toMillis(), original);
  });

  test('ignora cancelado e considera Faltou na reconciliação de vagas', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-status-vaga', { vagasTotais: { [service.id]: 2 }, vagasOcupadas: { [service.id]: 0 } });
    await seedDocuments([
      ['consulentes', 'agendado-1', { agendaId: agenda.id, pessoaBaseId: 'agendado-1', status: 'Agendado', servicosIds: [service.id] }],
      ['consulentes', 'cancelado-1', { agendaId: agenda.id, pessoaBaseId: 'cancelado-1', status: 'Cancelado', servicosIds: [service.id] }]
    ]);
    await book(db, agenda, person('nova'));
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 2);

    const faltouAgenda = await seedAgenda('agenda-faltou', { vagasTotais: { [service.id]: 1 }, vagasOcupadas: { [service.id]: 0 } });
    await seedDocuments([['consulentes', 'faltou-1', { agendaId: faltouAgenda.id, pessoaBaseId: 'faltou-1', status: 'Faltou', servicosIds: [service.id] }]]);
    await assert.rejects(book(db, faltouAgenda, person('outra')), /SEM_VAGA/);
    assert.equal((await getDoc(agendaRef(db, faltouAgenda.id))).data().vagasOcupadas[service.id], 0);
  });

  test('adapta pessoas, públicos e serviços legados sem migração', () => {
    assert.equal(getPessoaVinculo({ tipoPessoa: 'Consulente' }), 'consulente');
    assert.equal(getPessoaVinculo({ tipoPessoa: 'Médium' }), 'membro');
    assert.deepEqual(getPessoaFuncoesCasa({ tipoPessoa: 'Médium / Cambone' }), ['medium', 'cambone']);
    assert.deepEqual(getAgendaPublicosPermitidos({ tiposPessoaPermitidos: ['Consulente', 'Médium'] }), ['consulente', 'membro']);
    assert.equal(servicoControlaVagas({ requerVagas: true }), true);
    assert.equal(servicoPertenceAoTrabalho({ nome: 'Legado' }, 'trabalho-a'), true);
  });

  test('permite membro receber atendimento e bloqueia público incompatível', async () => {
    const db = adminDb();
    const memberAgenda = await seedAgenda('agenda-membros', { publicosPermitidos: ['membro'] });
    await book(db, memberAgenda, { ...person('membro'), vinculo: 'membro', funcoesCasa: ['medium'] });
    await assert.rejects(book(db, memberAgenda, { ...person('consulente'), vinculo: 'consulente' }), /PUBLICO_NAO_PERMITIDO/);
    const publicAgenda = await seedAgenda('agenda-publica', { publicosPermitidos: ['consulente', 'membro'] });
    await book(db, publicAgenda, { ...person('consulente-ok'), vinculo: 'consulente' });
  });

  test('exige serviço disponível e ativo na agenda', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-servicos', { servicosIds: ['permitido'], servicosStatus: { permitido: 'Ativo' } });
    await assert.rejects(createAgendamento({ agenda, pessoa: person('1'), servicos: [{ ...service, id: 'fora' }], userId: USER_ID, status: 'Agendado' }, db), /SERVICO_NAO_DISPONIVEL/);
    const canceled = { ...agenda, servicosIds: [service.id], servicosStatus: { [service.id]: 'Cancelado' } };
    await seedDocuments([['agendas', canceled.id, { ...canceled, id: null }]]);
    await assert.rejects(book(db, canceled, person('2')), /SERVICO_CANCELADO/);
  });

  test('edita agenda e protege ocupação, tipo e serviços com atendimentos', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-edicao', { tipoTrabalhoId: 'trabalho-a', servicosIds: [service.id], publicosPermitidos: ['consulente'] });
    await book(db, agenda, person('1'));
    await editarAgenda({ agendaId: agenda.id, userId: USER_ID, changes: { servicosIds: [service.id], vagasTotais: { [service.id]: 3 }, publicosPermitidos: ['consulente', 'membro'] } }, db);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasTotais[service.id], 3);
    await assert.rejects(editarAgenda({ agendaId: agenda.id, userId: USER_ID, changes: { servicosIds: [service.id], vagasTotais: { [service.id]: 0 } } }, db), /LIMITE_MENOR_QUE_OCUPACAO/);
    await assert.rejects(editarAgenda({ agendaId: agenda.id, userId: USER_ID, changes: { servicosIds: [], vagasTotais: {} } }, db), /SERVICO_COM_ATENDIMENTOS/);
    await assert.rejects(editarAgenda({ agendaId: agenda.id, userId: USER_ID, changes: { tipoTrabalhoId: 'trabalho-b', servicosIds: [service.id], vagasTotais: { [service.id]: 3 } } }, db), /TIPO_COM_ATENDIMENTOS/);
  });

  test('cancela serviço preservando atendimentos e quantidade afetada', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-cancelar-servico', { servicosIds: [service.id], servicosStatus: { [service.id]: 'Ativo' } });
    const appointmentId = await book(db, agenda, person('1'));
    assert.equal(await cancelarServicoAgenda({ agendaId: agenda.id, servicoId: service.id, userId: USER_ID }, db), 1);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().servicosStatus[service.id], 'Cancelado');
    assert.equal((await getDoc(appointmentById(db, appointmentId))).data().status, 'Agendado');
  });

  test('cancela agenda e bloqueia operações normais', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-cancelada');
    const appointmentId = await book(db, agenda, person('1'));
    await cancelarAgenda({ agendaId: agenda.id, userId: USER_ID }, db);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().status, 'Cancelada');
    await assert.rejects(book(db, { ...agenda, status: 'Cancelada' }, person('2')), /AGENDA_INDISPONIVEL/);
    await assert.rejects(cancelAgendamento({ agendaId: agenda.id, agendamentoId: appointmentId, userId: USER_ID }, db), /AGENDA_INDISPONIVEL/);
  });

  test('cancela agenda com Agendado, Faltou ou Cancelado e bloqueia Presente ou Concluído sem auditar', async () => {
    const db = adminDb();
    for (const status of ['Agendado', 'Faltou', 'Cancelado']) {
      const agenda = await seedAgenda(`agenda-cancelavel-${status}`);
      await seedDocuments([['consulentes', `${agenda.id}_1`, { agendaId: agenda.id, pessoaBaseId: '1', status }]]);
      await cancelarAgenda({ agendaId: agenda.id, userId: USER_ID }, db);
      assert.equal((await getDoc(agendaRef(db, agenda.id))).data().status, 'Cancelada');
    }
    for (const status of ['Presente', 'Concluído']) {
      const agenda = await seedAgenda(`agenda-bloqueada-${status}`);
      await seedDocuments([['consulentes', `${agenda.id}_1`, { agendaId: agenda.id, pessoaBaseId: '1', status }]]);
      await assert.rejects(cancelarAgenda({ agendaId: agenda.id, userId: USER_ID }, db), /AGENDA_POSSUI_ATENDIMENTO_EXECUTADO/);
      assert.equal((await getDoc(agendaRef(db, agenda.id))).data().status, 'Aberta');
      const audits = (await getDocs(collection(db, `${root}/auditoria`))).docs.filter(item => item.data().tipo === 'AGENDA_CANCELADA' && item.data().agendaId === agenda.id);
      assert.equal(audits.length, 0);
    }
  });

  test('corrige somente transições administrativas válidas, limpa horários e preserva vagas', async () => {
    const db = adminDb();
    const cases = [
      ['Concluído', 'Presente', true, false],
      ['Concluído', 'Agendado', false, false],
      ['Presente', 'Agendado', false, false],
      ['Faltou', 'Agendado', false, false]
    ];
    for (const [from, to, keepsArrival, keepsDeparture] of cases) {
      const agenda = await seedAgenda(`agenda-correcao-${from}-${to}`, { status: 'Concluída', vagasOcupadas: { [service.id]: 1 } });
      const appointmentId = `${agenda.id}_1`;
      const timestamps = from === 'Concluído' ? { horaChegada: new Date(), horaSaida: new Date() } : from === 'Presente' ? { horaChegada: new Date() } : {};
      await seedDocuments([['consulentes', appointmentId, { agendaId: agenda.id, pessoaBaseId: '1', status: from, ...timestamps, servicosIds: [service.id] }]]);
      await corrigirStatusAtendimento({ agendaId: agenda.id, agendamentoId: appointmentId, status: to, motivo: 'Correção de teste', userId: USER_ID }, db);
      const corrected = (await getDoc(appointmentRef(db, agenda.id, '1'))).data();
      assert.equal(corrected.status, to);
      assert.equal(Boolean(corrected.horaChegada), keepsArrival);
      assert.equal(Boolean(corrected.horaSaida), keepsDeparture);
      assert.deepEqual((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas, { [service.id]: 1 });
    }
    const audits = (await getDocs(collection(db, `${root}/auditoria`))).docs.map(item => item.data()).filter(item => item.tipo === 'STATUS_ATENDIMENTO_CORRIGIDO');
    assert.equal(audits.length, 4);
    assert.ok(audits.every(item => item.motivo === 'Correção de teste' && item.executadoPor === USER_ID && item.criadoEm));
  });

  test('bloqueia correções inválidas, motivo vazio, agenda cancelada e perfis não-admin', async () => {
    const db = adminDb();
    const invalidCases = [['Concluído', 'Faltou'], ['Cancelado', 'Agendado'], ['Agendado', 'Concluído']];
    for (const [from, to] of invalidCases) {
      const agenda = await seedAgenda(`agenda-invalida-${from}-${to}`);
      const appointmentId = `${agenda.id}_1`;
      await seedDocuments([['consulentes', appointmentId, { agendaId: agenda.id, pessoaBaseId: '1', status: from }]]);
      await assert.rejects(corrigirStatusAtendimento({ agendaId: agenda.id, agendamentoId: appointmentId, status: to, motivo: 'Teste', userId: USER_ID }, db), /CORRECAO_STATUS_INVALIDA/);
    }
    const emptyReasonAgenda = await seedAgenda('agenda-motivo-vazio');
    await seedDocuments([['consulentes', 'motivo-vazio-1', { agendaId: emptyReasonAgenda.id, status: 'Faltou' }]]);
    await assert.rejects(corrigirStatusAtendimento({ agendaId: emptyReasonAgenda.id, agendamentoId: 'motivo-vazio-1', status: 'Agendado', motivo: '  ', userId: USER_ID }, db), /MOTIVO_OBRIGATORIO/);
    const canceledAgenda = await seedAgenda('agenda-correcao-cancelada', { status: 'Cancelada' });
    await seedDocuments([['consulentes', 'cancelada-1', { agendaId: canceledAgenda.id, status: 'Concluído' }]]);
    await assert.rejects(corrigirStatusAtendimento({ agendaId: canceledAgenda.id, agendamentoId: 'cancelada-1', status: 'Presente', motivo: 'Teste', userId: USER_ID }, db), /AGENDA_INDISPONIVEL/);
    await seedDocuments([
      ['usuarios', 'gestor-business', { uid: 'gestor-business', role: 'gestor', ativo: true }],
      ['usuarios', 'atendimento-business', { uid: 'atendimento-business', role: 'atendimento', ativo: true }]
    ]);
    const permissionAgenda = await seedAgenda('agenda-permissao-correcao', { status: 'Concluída' });
    await seedDocuments([['consulentes', 'permissao-1', { agendaId: permissionAgenda.id, status: 'Concluído', horaChegada: new Date(), horaSaida: new Date() }]]);
    for (const [uid, role] of [['gestor-business', 'gestor'], ['atendimento-business', 'atendimento']]) {
      const roleDb = environment.authenticatedContext(uid, { email_verified: true }).firestore();
      await assert.rejects(corrigirStatusAtendimento({ agendaId: permissionAgenda.id, agendamentoId: 'permissao-1', status: 'Presente', motivo: role, userId: uid }, roleDb), error => error.code === 'permission-denied' || error.code === 'firestore/permission-denied');
    }
  });

  test('exclui agenda vazia e bloqueia exclusão quando existe histórico', async () => {
    const db = adminDb();
    const empty = await seedAgenda('agenda-vazia');
    await excluirAgendaVazia({ agendaId: empty.id, userId: USER_ID }, db);
    assert.equal((await getDoc(agendaRef(db, empty.id))).exists(), false);
    const withHistory = await seedAgenda('agenda-historico');
    await book(db, withHistory, person('1'));
    await assert.rejects(excluirAgendaVazia({ agendaId: withHistory.id, userId: USER_ID }, db), /AGENDA_POSSUI_HISTORICO/);
    assert.equal((await getDoc(agendaRef(db, withHistory.id))).exists(), true);
  });

  test('realoca atendimento completo preservando origem, vagas, locks e auditoria', async () => {
    const db = adminDb();
    const future = new Date(); future.setDate(future.getDate() + 10);
    const origin = await seedAgenda('origem-completa', {
      data: future, servicosIds: [service.id, serviceB.id], servicosNomes: { [service.id]: service.nome, [serviceB.id]: serviceB.nome },
      servicosStatus: { [service.id]: 'Ativo', [serviceB.id]: 'Ativo' }, vagasTotais: { [service.id]: 2, [serviceB.id]: 2 }, vagasOcupadas: { [service.id]: 0, [serviceB.id]: 0 }
    });
    const destination = await seedAgenda('destino-completa', {
      data: future, servicosIds: [service.id, serviceB.id], servicosNomes: { [service.id]: service.nome, [serviceB.id]: serviceB.nome },
      servicosStatus: { [service.id]: 'Ativo', [serviceB.id]: 'Ativo' }, vagasTotais: { [service.id]: 2, [serviceB.id]: 2 }, vagasOcupadas: { [service.id]: 0, [serviceB.id]: 0 }
    });
    const appointmentId = await createAgendamento({ agenda: origin, pessoa: person('realocada'), servicos: [service, serviceB], userId: USER_ID, status: 'Agendado' }, db);
    const destinationId = await realocarAtendimento({ origemAgendaId: origin.id, origemAgendamentoId: appointmentId, destinoAgendaId: destination.id, servicosIds: [service.id, serviceB.id], motivo: 'Mudança de data', userId: USER_ID, role: 'admin' }, db);
    const sourceData = (await getDoc(appointmentById(db, appointmentId))).data();
    const destinationData = (await getDoc(appointmentById(db, destinationId))).data();
    assert.equal(sourceData.status, 'Reagendado');
    assert.equal(isAtendimentoOperacional(sourceData), false);
    assert.equal(isAtendimentoOperacional(destinationData), true);
    assert.deepEqual(sourceData.servicosIds, [service.id, serviceB.id]);
    assert.equal(sourceData.servicosRealocados[service.id].realocacaoId, sourceData.ultimaRealocacaoId);
    assert.equal(destinationData.origemRealocacao.realocacaoId, sourceData.ultimaRealocacaoId);
    assert.deepEqual(getServicosAtivosAtendimento(sourceData), []);
    assert.equal((await getDoc(activeRef(db, origin.id, 'realocada'))).exists(), false);
    assert.equal((await getDoc(activeRef(db, destination.id, 'realocada'))).data().agendamentoId, destinationId);
    assert.deepEqual((await getDoc(agendaRef(db, origin.id))).data().vagasOcupadas, { [service.id]: 0, [serviceB.id]: 0 });
    assert.deepEqual((await getDoc(agendaRef(db, destination.id))).data().vagasOcupadas, { [service.id]: 1, [serviceB.id]: 1 });
    assert.equal((await getDoc(doc(db, path('auditoria', sourceData.ultimaRealocacaoId)))).data().tipo, 'ATENDIMENTO_REAGENDADO');
  });

  test('realoca somente um serviço e cancelamento posterior devolve apenas o serviço ativo', async () => {
    const db = adminDb();
    const future = new Date(); future.setDate(future.getDate() + 12);
    const origin = await seedAgenda('origem-parcial', {
      data: future, servicosIds: [service.id, serviceB.id], servicosNomes: { [service.id]: service.nome, [serviceB.id]: serviceB.nome },
      servicosStatus: { [service.id]: 'Ativo', [serviceB.id]: 'Ativo' }, vagasTotais: { [service.id]: 3, [serviceB.id]: 3 }, vagasOcupadas: { [service.id]: 0, [serviceB.id]: 0 }
    });
    const destination = await seedAgenda('destino-parcial', {
      data: future, servicosIds: [serviceB.id], servicosNomes: { [serviceB.id]: serviceB.nome }, servicosStatus: { [serviceB.id]: 'Ativo' },
      vagasTotais: { [serviceB.id]: 3 }, vagasOcupadas: { [serviceB.id]: 0 }
    });
    const appointmentId = await createAgendamento({ agenda: origin, pessoa: person('parcial'), servicos: [service, serviceB], userId: USER_ID, status: 'Agendado' }, db);
    await updateDoc(agendaRef(db, origin.id), { servicosStatus: { [service.id]: 'Ativo', [serviceB.id]: 'Cancelado' } });
    await realocarAtendimento({ origemAgendaId: origin.id, origemAgendamentoId: appointmentId, destinoAgendaId: destination.id, servicosIds: [serviceB.id], motivo: 'Serviço cancelado', userId: USER_ID, role: 'admin' }, db);
    const sourceData = (await getDoc(appointmentById(db, appointmentId))).data();
    assert.equal(sourceData.status, 'Agendado');
    assert.equal(isAtendimentoOperacional(sourceData), true);
    assert.deepEqual(getServicosAtivosAtendimento(sourceData), [service.id]);
    assert.equal(getNomeServicoAtendimento(sourceData, service.id), service.nome);
    assert.equal((await getDoc(activeRef(db, origin.id, 'parcial'))).data().agendamentoId, appointmentId);
    await cancelAgendamento({ agendaId: origin.id, agendamentoId: appointmentId, userId: USER_ID }, db);
    assert.deepEqual((await getDoc(agendaRef(db, origin.id))).data().vagasOcupadas, { [service.id]: 0, [serviceB.id]: 0 });
  });

  test('normaliza nome legado ao realocar e recusa destino sem identificação', async () => {
    assert.equal(getNomePessoaAtendimento({ nome: 'Nome do cadastro' }, { pessoaNome: 'Nome legado' }), 'Nome do cadastro');
    assert.equal(getNomePessoaAtendimento({}, { pessoaNome: 'Nome legado' }), 'Nome legado');
    assert.equal(getNomePessoaAtendimento({}, {}), '');

    const db = adminDb(); const future = new Date(); future.setDate(future.getDate() + 18);
    const origin = await seedAgenda('origem-nome-legado', { data: future, servicosIds: [service.id], servicosNomes: { [service.id]: service.nome }, servicosStatus: { [service.id]: 'Ativo' } });
    const destination = await seedAgenda('destino-nome-legado', { data: future, servicosIds: [service.id], servicosNomes: { [service.id]: service.nome }, servicosStatus: { [service.id]: 'Ativo' } });
    await seedDocuments([
      ['pessoas', 'legada', { pessoaNome: 'Pessoa Legada', tipoPessoa: 'Consulente' }],
      ['consulentes', 'atendimento-legado', { agendaId: origin.id, pessoaBaseId: 'legada', pessoaNome: 'Nome antigo', status: 'Agendado', servicosIds: [service.id], servicosNomes: { [service.id]: service.nome } }],
      ['agendamentos_ativos', `${origin.id}_legada`, { agendaId: origin.id, pessoaBaseId: 'legada', agendamentoId: 'atendimento-legado' }]
    ]);
    const destinationId = await realocarAtendimento({ origemAgendaId: origin.id, origemAgendamentoId: 'atendimento-legado', destinoAgendaId: destination.id, servicosIds: [service.id], motivo: 'Compatibilidade legada', userId: USER_ID, role: 'admin' }, db);
    assert.equal((await getDoc(appointmentById(db, destinationId))).data().nome, 'Pessoa Legada');

    const unnamedOrigin = await seedAgenda('origem-sem-nome', { data: future, servicosIds: [service.id], servicosStatus: { [service.id]: 'Ativo' } });
    await seedDocuments([
      ['pessoas', 'sem-nome', { tipoPessoa: 'Consulente' }],
      ['consulentes', 'atendimento-sem-nome', { agendaId: unnamedOrigin.id, pessoaBaseId: 'sem-nome', status: 'Agendado', servicosIds: [service.id], servicosNomes: [service.nome] }],
      ['agendamentos_ativos', `${unnamedOrigin.id}_sem-nome`, { agendaId: unnamedOrigin.id, pessoaBaseId: 'sem-nome', agendamentoId: 'atendimento-sem-nome' }]
    ]);
    await assert.rejects(realocarAtendimento({ origemAgendaId: unnamedOrigin.id, origemAgendamentoId: 'atendimento-sem-nome', destinoAgendaId: destination.id, servicosIds: [service.id], motivo: 'Sem nome', userId: USER_ID, role: 'admin' }, db), /PESSOA_SEM_NOME/);
  });

  test('realoca a partir de agenda cancelada sem reabri-la nem alterar suas vagas', async () => {
    const db = adminDb(); const future = new Date(); future.setDate(future.getDate() + 15);
    const origin = await seedAgenda('origem-cancelada-realocacao', { data: future, status: 'Aberta', servicosIds: [service.id], servicosStatus: { [service.id]: 'Ativo' } });
    const destination = await seedAgenda('destino-agenda-cancelada', { data: future, servicosIds: [service.id], servicosStatus: { [service.id]: 'Ativo' } });
    const appointmentId = await book(db, origin, person('cancelada-realocada'));
    await updateDoc(agendaRef(db, origin.id), { status: 'Cancelada' });
    await realocarAtendimento({ origemAgendaId: origin.id, origemAgendamentoId: appointmentId, destinoAgendaId: destination.id, servicosIds: [service.id], motivo: 'Agenda cancelada', userId: USER_ID, role: 'admin' }, db);
    const storedOrigin = (await getDoc(agendaRef(db, origin.id))).data();
    assert.equal(storedOrigin.status, 'Cancelada');
    assert.equal(storedOrigin.vagasOcupadas[service.id], 1);
    assert.equal((await getDoc(appointmentById(db, appointmentId))).data().status, 'Reagendado');
  });

  test('falhas de destino não deixam escrita parcial', async () => {
    const db = adminDb(); const future = new Date(); future.setDate(future.getDate() + 16);
    const origin = await seedAgenda('origem-falhas', { data: future, servicosIds: [service.id], servicosStatus: { [service.id]: 'Ativo' } });
    const full = await seedAgenda('destino-sem-vaga', { data: future, servicosIds: [service.id], servicosStatus: { [service.id]: 'Ativo' }, vagasTotais: { [service.id]: 1 }, vagasOcupadas: { [service.id]: 1 } });
    const appointmentId = await book(db, origin, person('falhas'));
    await assert.rejects(realocarAtendimento({ origemAgendaId: origin.id, origemAgendamentoId: appointmentId, destinoAgendaId: full.id, servicosIds: [service.id], motivo: 'Teste', userId: USER_ID, role: 'admin' }, db), /SEM_VAGA/);
    assert.equal((await getDoc(appointmentById(db, appointmentId))).data().status, 'Agendado');
    assert.equal((await getDoc(activeRef(db, origin.id, 'falhas'))).data().agendamentoId, appointmentId);
    assert.equal((await getDocs(collection(db, `${root}/auditoria`))).docs.filter(item => ['ATENDIMENTO_REAGENDADO', 'SERVICO_REALOCADO'].includes(item.data().tipo)).length, 0);
  });

  test('concorrência permite somente uma realocação do mesmo atendimento', async () => {
    const db = adminDb(); const future = new Date(); future.setDate(future.getDate() + 17);
    const origin = await seedAgenda('origem-concorrente', { data: future, servicosIds: [service.id], servicosStatus: { [service.id]: 'Ativo' } });
    const destinationA = await seedAgenda('destino-concorrente-a', { data: future, servicosIds: [service.id], servicosStatus: { [service.id]: 'Ativo' } });
    const destinationB = await seedAgenda('destino-concorrente-b', { data: future, servicosIds: [service.id], servicosStatus: { [service.id]: 'Ativo' } });
    const appointmentId = await book(db, origin, person('concorrente'));
    const params = destination => ({ origemAgendaId: origin.id, origemAgendamentoId: appointmentId, destinoAgendaId: destination.id, servicosIds: [service.id], motivo: 'Concorrência', userId: USER_ID, role: 'admin' });
    const results = await Promise.allSettled([realocarAtendimento(params(destinationA), db), realocarAtendimento(params(destinationB), db)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.equal((await getDocs(collection(db, `${root}/consulentes`))).size, 2);
  });
});
