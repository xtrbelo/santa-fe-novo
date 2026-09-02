import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

const PROJECT_ID = 'santa-fe-rules-test';
const APP_ID = PROJECT_ID;
const root = `artifacts/${APP_ID}/public/data`;
const paths = {
  user: uid => `${root}/usuarios/${uid}`,
  people: `${root}/pessoas/pessoa-1`,
  agendas: `${root}/agendas/agenda-1`,
  appointments: `${root}/consulentes/consulta-1`,
  config: `${root}/config_servicos/servico-1`,
  audit: `${root}/auditoria/audit-1`
};
const inviteId = 'a'.repeat(64);
const invitePath = id => `${root}/convites_membro/${id}`;
const inviteIndexPath = cpf => `${root}/convite_membro_cpf_index/${cpf}`;
const registrationPath = id => `${root}/autocadastros_membro/${id}`;
const authorizationPath = pessoaId => `${root}/autorizacoes_acesso/${pessoaId}`;
const inviteData = (uid, overrides = {}) => ({ nome: 'Pessoa Convidada', cpf: '52998224725', email: 'convite@example.test', status: 'ativo', criadoEm: new Date(), criadoPor: uid, expiraEm: new Date(Date.now() + 7 * 86400000), atualizadoEm: new Date(), atualizadoPor: uid, ...overrides });
const registrationData = (id, overrides = {}) => ({ inviteId: id, nome: 'Pessoa Convidada', cpf: '52998224725', dataNascimento: null, contato: null, email: 'pessoa@example.test', sexo: 'nao_informado', estadoCivil: 'nao_informado', endereco: { cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null }, dadosCasa: { dataIngresso: null, batizadoCaesf: false, dataBatismoCaesf: null }, statusCadastro: 'aguardando_validacao', origemCadastro: 'autocadastro', enviadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(), ...overrides });

let environment;
const authDb = (uid, claims = {}) => environment.authenticatedContext(uid, { email_verified: true, ...claims }).firestore();
const anonymousDb = () => environment.unauthenticatedContext().firestore();
const ref = (db, path) => doc(db, path);
const canonicalMember = overrides => ({ nome: 'Membro Nove', cpf: '12345678900', email: null, vinculo: 'membro', tipoPessoa: 'Membro', funcoesCasa: ['medium'], sexo: 'nao_informado', estadoCivil: 'nao_informado', endereco: { cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null }, dadosCasa: { dataIngresso: null, dataBatismoCaesf: null }, statusCadastro: 'aprovado', origemCadastro: 'administrativo', ativo: true, ...overrides });

async function seed() {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const users = [
      ['admin-a', 'admin', true], ['admin-b', 'admin', true], ['gestor', 'gestor', true],
      ['atendimento', 'atendimento', true], ['pendente', 'pendente', true], ['inativo-admin', 'admin', false]
    ];
    await Promise.all(users.map(([uid, role, ativo]) => setDoc(ref(db, paths.user(uid)), { uid, nome: uid, email: `${uid}@example.test`, role, ativo, ...(role !== 'pendente' ? { pessoaBaseId: `membro-${uid}` } : {}), criadoEm: new Date(), atualizadoEm: new Date() })));
    await Promise.all(users.filter(([, role]) => role !== 'pendente').map(([uid]) => setDoc(ref(db, `${root}/pessoas/membro-${uid}`), canonicalMember({ nome: `Membro ${uid}`, email: `${uid}@example.test` }))));
    await Promise.all([
      setDoc(ref(db, paths.people), { nome: 'Pessoa', vinculo: 'consulente', tipoPessoa: 'Consulente', funcoesCasa: [], ativo: true }),
      setDoc(ref(db, `${root}/pessoas/membro-autorizacao`), { nome: 'Membro Autorização', email: 'pendente@example.test', vinculo: 'membro', ativo: true }),
      setDoc(ref(db, `${root}/pessoas/membro-email-divergente`), { nome: 'Outro Membro', email: 'outro@example.test', vinculo: 'membro', ativo: true }),
      setDoc(ref(db, `${root}/pessoas/membro-sem-email`), { nome: 'Sem E-mail', vinculo: 'membro', ativo: true }),
      setDoc(ref(db, `${root}/pessoas/consulente-acesso`), { nome: 'Consulente', vinculo: 'consulente', ativo: true }),
      setDoc(ref(db, `${root}/pessoas/membro-inativo`), { nome: 'Membro Inativo', vinculo: 'membro', ativo: false }),
      setDoc(ref(db, paths.agendas), { tipo: 'Agenda', status: 'Aberta', vagasOcupadas: {}, ativo: true }),
      setDoc(ref(db, paths.appointments), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-1', status: 'Agendado' }),
      setDoc(ref(db, paths.config), { nome: 'Serviço', ativo: true }),
      setDoc(ref(db, paths.audit), { tipo: 'USUARIO_ROLE_ALTERADO', alvoUid: 'gestor', executadoPor: 'admin-a', criadoEm: new Date() })
    ]);
  });
}

before(async () => {
  environment = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
beforeEach(async () => { await environment.clearFirestore(); await seed(); });
after(async () => { await environment.cleanup(); });

describe('A. não autenticado', () => {
  for (const [name, path] of Object.entries({ pessoas: paths.people, agendas: paths.agendas, consulentes: paths.appointments, usuarios: paths.user('admin-a') })) {
    test(`não lê ${name}`, async () => assertFails(getDoc(ref(anonymousDb(), path))));
  }
  test('não escreve dados', async () => assertFails(setDoc(ref(anonymousDb(), `${root}/pessoas/nova`), { nome: 'Nova' })));
  test('não consulta usuários por e-mail', async () => assertFails(getDocs(collection(anonymousDb(), `${root}/usuarios`))));
});

describe('B. pendente', () => {
  test('lê o próprio documento', async () => assertSucceeds(getDoc(ref(authDb('pendente'), paths.user('pendente')))));
  for (const [name, path] of Object.entries({ pessoas: paths.people, agendas: paths.agendas, consulentes: paths.appointments, configuracoes: paths.config, terceiro: paths.user('gestor'), auditoria: paths.audit })) {
    test(`não acessa ${name}`, async () => assertFails(getDoc(ref(authDb('pendente'), path))));
  }
});

describe('B2. verificação de e-mail', () => {
  test('usuário Atendimento não verificado não lê nem altera dados operacionais', async () => {
    const db = authDb('atendimento', { email_verified: false });
    for (const path of [paths.people, paths.agendas, paths.appointments, paths.config]) {
      await assertFails(getDoc(ref(db, path)));
    }
    await assertFails(updateDoc(ref(db, paths.appointments), { status: 'Presente' }));
    const batch = writeBatch(db);
    batch.set(ref(db, `${root}/consulentes/nao-verificado`), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-1', status: 'Agendado' });
    batch.set(ref(db, `${root}/agendamentos_ativos/agenda-1_pessoa-1`), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-1', agendamentoId: 'nao-verificado', criadoEm: new Date(), criadoPor: 'atendimento' });
    await assertFails(batch.commit());
  });

  test('usuário Atendimento verificado acessa somente sua operação permitida', async () => {
    const db = authDb('atendimento', { email_verified: true });
    await assertSucceeds(getDoc(ref(db, paths.people)));
    await assertSucceeds(getDoc(ref(db, paths.agendas)));
    await assertSucceeds(updateDoc(ref(db, paths.appointments), { status: 'Presente' }));
    await assertFails(getDocs(collection(db, `${root}/usuarios`)));
    await assertFails(updateDoc(ref(db, paths.config), { ativo: false }));
  });

  test('conta sem perfil não cria perfil e não acessa dados ou terceiros', async () => {
    const db = authDb('novo-nao-verificado', { email: 'novo@santafe.local', email_verified: false });
    const profile = { uid: 'novo-nao-verificado', nome: 'Novo', email: 'novo@santafe.local', role: 'pendente', ativo: true, criadoEm: new Date(), atualizadoEm: new Date() };
    await assertFails(setDoc(ref(db, paths.user('novo-nao-verificado')), profile));
    await assertSucceeds(getDoc(ref(db, paths.user('novo-nao-verificado'))));
    for (const path of [paths.people, paths.agendas, paths.appointments, paths.config, paths.user('gestor')]) {
      await assertFails(getDoc(ref(db, path)));
    }
  });
});

describe('C. inativo', () => {
  for (const [name, path] of Object.entries({ pessoas: paths.people, agendas: paths.agendas, consulentes: paths.appointments, configuracoes: paths.config })) {
    test(`admin inativo não acessa ${name}`, async () => assertFails(getDoc(ref(authDb('inativo-admin'), path))));
  }
});

describe('C2. convites individuais de Membro', () => {
  test('Admin e Gestor leem e criam convite válido', async () => {
    for (const uid of ['admin-a', 'gestor']) {
      const db = authDb(uid); const id = uid === 'admin-a' ? inviteId : 'b'.repeat(64); const cpf = uid === 'admin-a' ? '52998224725' : '16899535009';
      const batch = writeBatch(db);
      batch.set(ref(db, invitePath(id)), inviteData(uid, { cpf }));
      batch.set(ref(db, inviteIndexPath(cpf)), { inviteId: id, criadoEm: new Date(), criadoPor: uid });
      await assertSucceeds(batch.commit());
      await assertSucceeds(getDoc(ref(db, invitePath(id))));
      await assertSucceeds(getDoc(ref(db, inviteIndexPath(cpf))));
    }
  });

  test('Atendimento não lê e nenhum deles cria convite administrativamente', async () => {
    await environment.withSecurityRulesDisabled(async context => { const db = context.firestore(); await setDoc(ref(db, invitePath(inviteId)), inviteData('admin-a')); await setDoc(ref(db, inviteIndexPath('52998224725')), { inviteId, criadoEm: new Date(), criadoPor: 'admin-a' }); });
    await assertFails(getDoc(ref(authDb('atendimento'), invitePath(inviteId))));
    await assertSucceeds(getDoc(ref(anonymousDb(), invitePath(inviteId))));
    await assertFails(getDoc(ref(authDb('atendimento'), inviteIndexPath('52998224725'))));
    await assertFails(getDoc(ref(anonymousDb(), inviteIndexPath('52998224725'))));
    await assertFails(setDoc(ref(authDb('atendimento'), invitePath('b'.repeat(64))), inviteData('atendimento')));
    await assertFails(setDoc(ref(anonymousDb(), invitePath('c'.repeat(64))), inviteData('anonimo')));
  });

  test('rejeita campo arbitrário e qualquer token bruto persistido', async () => {
    for (const invalid of [{ campoNaoPermitido: true }, { token: 'token-bruto' }, { pessoaId: 'nao-existe' }]) {
      const db = authDb('admin-a'); const batch = writeBatch(db);
      batch.set(ref(db, invitePath(inviteId)), inviteData('admin-a', invalid));
      batch.set(ref(db, inviteIndexPath('52998224725')), { inviteId, criadoEm: new Date(), criadoPor: 'admin-a' });
      await assertFails(batch.commit());
    }
  });

  test('Admin e Gestor revogam somente os campos permitidos', async () => {
    for (const [uid, id] of [['admin-a', inviteId], ['gestor', 'b'.repeat(64)]]) {
      await environment.withSecurityRulesDisabled(async context => { const db = context.firestore(); await setDoc(ref(db, invitePath(id)), inviteData(uid)); await setDoc(ref(db, inviteIndexPath('52998224725')), { inviteId: id, criadoEm: new Date(), criadoPor: uid }); });
      const db = authDb(uid); const batch = writeBatch(db);
      batch.update(ref(db, invitePath(id)), { status: 'revogado', revogadoEm: new Date(), revogadoPor: uid, atualizadoEm: new Date(), atualizadoPor: uid });
      batch.delete(ref(db, inviteIndexPath('52998224725')));
      await assertSucceeds(batch.commit());
      assert.equal((await getDoc(ref(authDb(uid), invitePath(id)))).data().status, 'revogado');
    }
  });

  test('revogação não troca identidade, e-mail, autoria ou expiração', async () => {
    const seedInvite = async () => environment.withSecurityRulesDisabled(async context => { const db = context.firestore(); await setDoc(ref(db, invitePath(inviteId)), inviteData('admin-a')); await setDoc(ref(db, inviteIndexPath('52998224725')), { inviteId, criadoEm: new Date(), criadoPor: 'admin-a' }); });
    for (const invalid of [{ nome: 'Outro' }, { cpf: '16899535009' }, { email: 'outro@example.test' }, { criadoPor: 'gestor' }, { expiraEm: new Date(Date.now() + 30 * 86400000) }]) {
      await seedInvite();
      const db = authDb('admin-a'); const batch = writeBatch(db);
      batch.update(ref(db, invitePath(inviteId)), { ...invalid, status: 'revogado', revogadoEm: new Date(), revogadoPor: 'admin-a', atualizadoEm: new Date(), atualizadoPor: 'admin-a' });
      batch.delete(ref(db, inviteIndexPath('52998224725')));
      await assertFails(batch.commit());
    }
  });

  test('Atendimento não revoga e delete é negado para todos', async () => {
    await environment.withSecurityRulesDisabled(async context => { const db = context.firestore(); await setDoc(ref(db, invitePath(inviteId)), inviteData('admin-a')); await setDoc(ref(db, inviteIndexPath('52998224725')), { inviteId, criadoEm: new Date(), criadoPor: 'admin-a' }); });
    const atendimentoDb = authDb('atendimento'); const atendimentoBatch = writeBatch(atendimentoDb); atendimentoBatch.update(ref(atendimentoDb, invitePath(inviteId)), { status: 'revogado', revogadoEm: new Date(), revogadoPor: 'atendimento', atualizadoEm: new Date(), atualizadoPor: 'atendimento' }); atendimentoBatch.delete(ref(atendimentoDb, inviteIndexPath('52998224725')));
    await assertFails(atendimentoBatch.commit());
    for (const db of [authDb('admin-a'), authDb('gestor'), authDb('atendimento'), anonymousDb()]) await assertFails(deleteDoc(ref(db, invitePath(inviteId))));
  });

  test('Admin e Gestor substituem indice de convite expirado sem alterar o convite antigo', async () => {
    for (const [uid, suffix, cpf] of [['admin-a', 'b', '52998224725'], ['gestor', 'c', '16899535009']]) {
      const oldId = suffix.repeat(64); const newId = (suffix === 'b' ? 'd' : 'e').repeat(64);
      await environment.withSecurityRulesDisabled(async context => {
        const db = context.firestore();
        await setDoc(ref(db, invitePath(oldId)), inviteData(uid, { cpf, expiraEm: new Date(Date.now() - 1000) }));
        await setDoc(ref(db, inviteIndexPath(cpf)), { inviteId: oldId, criadoEm: new Date(Date.now() - 8 * 86400000), criadoPor: uid });
      });
      const db = authDb(uid); const batch = writeBatch(db);
      batch.set(ref(db, invitePath(newId)), inviteData(uid, { cpf }));
      batch.set(ref(db, inviteIndexPath(cpf)), { inviteId: newId, criadoEm: new Date(), criadoPor: uid });
      await assertSucceeds(batch.commit());
      assert.equal((await getDoc(ref(db, invitePath(oldId)))).data().status, 'ativo');
      assert.equal((await getDoc(ref(db, inviteIndexPath(cpf)))).data().inviteId, newId);
      await environment.clearFirestore(); await seed();
    }
  });

  test('nega substituir indice se convite anterior ainda estiver valido', async () => {
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(ref(db, invitePath(inviteId)), inviteData('admin-a'));
      await setDoc(ref(db, inviteIndexPath('52998224725')), { inviteId, criadoEm: new Date(), criadoPor: 'admin-a' });
    });
    const newId = 'f'.repeat(64); const db = authDb('admin-a'); const batch = writeBatch(db);
    batch.set(ref(db, invitePath(newId)), inviteData('admin-a'));
    batch.set(ref(db, inviteIndexPath('52998224725')), { inviteId: newId, criadoEm: new Date(), criadoPor: 'admin-a' });
    await assertFails(batch.commit());
  });

  test('Atendimento e nao autenticado nao substituem indice expirado', async () => {
    const oldId = 'b'.repeat(64);
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(ref(db, invitePath(oldId)), inviteData('admin-a', { expiraEm: new Date(Date.now() - 1000) }));
      await setDoc(ref(db, inviteIndexPath('52998224725')), { inviteId: oldId, criadoEm: new Date(), criadoPor: 'admin-a' });
    });
    for (const [db, id, uid] of [[authDb('atendimento'), 'c'.repeat(64), 'atendimento'], [anonymousDb(), 'd'.repeat(64), 'anonimo']]) {
      const batch = writeBatch(db);
      batch.set(ref(db, invitePath(id)), inviteData(uid));
      batch.set(ref(db, inviteIndexPath('52998224725')), { inviteId: id, criadoEm: new Date(), criadoPor: uid });
      await assertFails(batch.commit());
    }
  });
});

describe('C3. autocadastro público de Membro', () => {
  async function seedInvite(overrides = {}) {
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), invitePath(inviteId)), inviteData('admin-a', overrides)));
  }
  function registrationBatch(db, overrides = {}, options = {}) {
    const batch = writeBatch(db);
    if (!options.omitRegistration) batch.set(ref(db, registrationPath(inviteId)), registrationData(inviteId, overrides));
    if (!options.omitInviteUpdate) batch.update(ref(db, invitePath(inviteId)), { status: 'respondido', respondidoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
    return batch;
  }

  test('público faz get exato de convite ativo e respondido válidos, mas nunca lista', async () => {
    await seedInvite();
    await assertSucceeds(getDoc(ref(anonymousDb(), invitePath(inviteId))));
    await assertFails(getDocs(collection(anonymousDb(), `${root}/convites_membro`)));
    await environment.withSecurityRulesDisabled(async context => updateDoc(ref(context.firestore(), invitePath(inviteId)), { status: 'respondido', respondidoEm: new Date() }));
    await assertSucceeds(getDoc(ref(anonymousDb(), invitePath(inviteId))));
  });

  test('público não lê convite expirado ou revogado', async () => {
    await seedInvite({ expiraEm: new Date(Date.now() - 1000) });
    await assertFails(getDoc(ref(anonymousDb(), invitePath(inviteId))));
    await environment.clearFirestore(); await seed(); await seedInvite({ status: 'revogado' });
    await assertFails(getDoc(ref(anonymousDb(), invitePath(inviteId))));
  });

  test('Admin e Gestor leem autocadastro; Atendimento e público não leem nem listam', async () => {
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), registrationPath(inviteId)), { ...registrationData(inviteId), enviadoEm: new Date(), atualizadoEm: new Date() }));
    for (const uid of ['admin-a', 'gestor']) await assertSucceeds(getDoc(ref(authDb(uid), registrationPath(inviteId))));
    await assertFails(getDoc(ref(authDb('atendimento'), registrationPath(inviteId))));
    await assertFails(getDoc(ref(anonymousDb(), registrationPath(inviteId))));
    await assertFails(getDocs(collection(anonymousDb(), `${root}/autocadastros_membro`)));
  });

  test('operação pública válida cria autocadastro e muda convite atomicamente', async () => {
    await seedInvite();
    await assertSucceeds(registrationBatch(anonymousDb()).commit());
    const admin = authDb('admin-a');
    assert.equal((await getDoc(ref(admin, invitePath(inviteId)))).data().status, 'respondido');
    assert.equal((await getDoc(ref(admin, registrationPath(inviteId)))).data().statusCadastro, 'aguardando_validacao');
  });

  test('público não cria autocadastro nem altera convite isoladamente', async () => {
    await seedInvite();
    await assertFails(registrationBatch(anonymousDb(), {}, { omitInviteUpdate: true }).commit());
    await assertFails(registrationBatch(anonymousDb(), {}, { omitRegistration: true }).commit());
  });

  test('nega CPF, nome, status e campos sensíveis adulterados', async () => {
    for (const invalid of [{ cpf: '16899535009' }, { nome: 'Outro nome' }, { contato: 'telefone inválido' }, { contato: '969999999999' }, { email: 'invalido' }, { dataNascimento: '30/08/2000' }, { statusCadastro: 'aprovado' }, { pessoaId: 'fraude' }, { role: 'admin' }, { funcoesCasa: ['medium'] }, { dadosCasa: {} }]) {
      await seedInvite();
      await assertFails(registrationBatch(anonymousDb(), invalid).commit());
      await environment.clearFirestore(); await seed();
    }
  });

  test('segundo envio e update/delete público do autocadastro são negados', async () => {
    await seedInvite(); await assertSucceeds(registrationBatch(anonymousDb()).commit());
    await assertFails(registrationBatch(anonymousDb()).commit());
    await assertFails(updateDoc(ref(anonymousDb(), registrationPath(inviteId)), { contato: 'outro' }));
    await assertFails(deleteDoc(ref(anonymousDb(), registrationPath(inviteId))));
  });

  test('decisão isolada e entidades relacionadas incompletas são negadas', async () => {
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(ref(db, invitePath(inviteId)), inviteData('admin-a', { status: 'respondido', respondidoEm: new Date() }));
      await setDoc(ref(db, inviteIndexPath('52998224725')), { inviteId, criadoEm: new Date(), criadoPor: 'admin-a' });
      await setDoc(ref(db, registrationPath(inviteId)), { ...registrationData(inviteId), enviadoEm: new Date(), atualizadoEm: new Date() });
    });
    for (const uid of ['admin-a', 'gestor', 'atendimento']) {
      await assertFails(updateDoc(ref(authDb(uid), registrationPath(inviteId)), { statusCadastro: 'aprovado', pessoaId: 'isolada', analisadoPor: uid, analisadoEm: new Date(), atualizadoEm: new Date() }));
    }
    await assertFails(updateDoc(ref(anonymousDb(), registrationPath(inviteId)), { statusCadastro: 'rejeitado', motivoRejeicao: 'fraude' }));
    await assertFails(setDoc(ref(authDb('admin-a'), `${root}/pessoas/isolada`), canonicalMember({ cpf: '52998224725', funcoesCasa: [], origemCadastro: 'autocadastro', criadoPor: 'admin-a', atualizadoPor: 'admin-a' })));
    await assertFails(setDoc(ref(authDb('admin-a'), `${root}/cpf_index/52998224725`), { pessoaId: 'isolada', criadoEm: new Date() }));
    await assertFails(setDoc(ref(authDb('admin-a'), `${root}/auditoria/autocadastro_aprovado_${inviteId}`), { tipo: 'AUTOCADASTRO_MEMBRO_APROVADO', inviteId, autocadastroId: inviteId, pessoaId: 'isolada', executadoPor: 'admin-a', executadoEm: new Date() }));
  });

  test('convite expirado, revogado ou respondido não aceita envio', async () => {
    for (const overrides of [{ expiraEm: new Date(Date.now() - 1000) }, { status: 'revogado' }, { status: 'respondido', respondidoEm: new Date() }]) {
      await seedInvite(overrides);
      await assertFails(registrationBatch(anonymousDb()).commit());
      await environment.clearFirestore(); await seed();
    }
  });
});

describe('D. admin', () => {
  test('autoriza pendente somente com membro ativo, índice coerente e auditoria', async () => {
    const db = authDb('admin-a');
    const batch = writeBatch(db);
    batch.update(ref(db, paths.user('pendente')), { role: 'atendimento', ativo: true, pessoaBaseId: 'membro-autorizacao', atualizadoEm: new Date(), atualizadoPor: 'admin-a' });
    batch.set(ref(db, `${root}/usuario_pessoa_index/membro-autorizacao`), { pessoaBaseId: 'membro-autorizacao', uid: 'pendente', criadoEm: new Date(), criadoPor: 'admin-a' });
    batch.set(ref(db, `${root}/auditoria/usuario_acesso_pendente_membro-autorizacao`), { tipo: 'USUARIO_AUTORIZADO', alvoUid: 'pendente', pessoaBaseId: 'membro-autorizacao', role: 'atendimento', executadoPor: 'admin-a', criadoEm: new Date() });
    await assertSucceeds(batch.commit());
  });
  test('recusa autorização sem índice, com consulente ou membro inativo', async () => {
    await assertFails(updateDoc(ref(authDb('admin-a'), paths.user('pendente')), { role: 'atendimento', pessoaBaseId: 'membro-autorizacao', atualizadoEm: new Date(), atualizadoPor: 'admin-a' }));
    for (const pessoaBaseId of ['consulente-acesso', 'membro-inativo']) {
      const db = authDb('admin-a'); const batch = writeBatch(db);
      batch.update(ref(db, paths.user('pendente')), { role: 'atendimento', pessoaBaseId, atualizadoEm: new Date(), atualizadoPor: 'admin-a' });
      batch.set(ref(db, `${root}/usuario_pessoa_index/${pessoaBaseId}`), { pessoaBaseId, uid: 'pendente', criadoEm: new Date(), criadoPor: 'admin-a' });
      await assertFails(batch.commit());
    }
  });
  test('recusa vínculo quando e-mail diverge ou o membro não possui e-mail', async () => {
    for (const pessoaBaseId of ['membro-email-divergente', 'membro-sem-email']) {
      const db = authDb('admin-a'); const batch = writeBatch(db);
      batch.update(ref(db, paths.user('pendente')), { role: 'atendimento', pessoaBaseId, atualizadoEm: new Date(), atualizadoPor: 'admin-a' });
      batch.set(ref(db, `${root}/usuario_pessoa_index/${pessoaBaseId}`), { pessoaBaseId, uid: 'pendente', criadoEm: new Date(), criadoPor: 'admin-a' });
      batch.set(ref(db, `${root}/auditoria/usuario_acesso_pendente_${pessoaBaseId}`), { tipo: 'USUARIO_AUTORIZADO', alvoUid: 'pendente', pessoaBaseId, role: 'atendimento', executadoPor: 'admin-a', criadoEm: new Date() });
      await assertFails(batch.commit());
    }
  });
  test('vínculo não pode modificar o e-mail do usuário para forçar correspondência', async () => {
    const db = authDb('admin-a'); const pessoaBaseId = 'membro-email-divergente'; const batch = writeBatch(db);
    batch.update(ref(db, paths.user('pendente')), { email: 'outro@example.test', role: 'atendimento', pessoaBaseId, atualizadoEm: new Date(), atualizadoPor: 'admin-a' });
    batch.set(ref(db, `${root}/usuario_pessoa_index/${pessoaBaseId}`), { pessoaBaseId, uid: 'pendente', criadoEm: new Date(), criadoPor: 'admin-a' });
    batch.set(ref(db, `${root}/auditoria/usuario_acesso_pendente_${pessoaBaseId}`), { tipo: 'USUARIO_AUTORIZADO', alvoUid: 'pendente', pessoaBaseId, role: 'atendimento', executadoPor: 'admin-a', criadoEm: new Date() });
    await assertFails(batch.commit());
  });
  test('pode reconstruir somente o índice de busca de pessoas', async () => {
    await assertSucceeds(updateDoc(ref(authDb('admin-a'), paths.people), { busca: { versao: 1, nome: 'pessoa teste', telefone: '', termos: ['pe'] } }));
  });
  test('opera Pessoas sem excluir fisicamente', async () => {
    const db = authDb('admin-a');
    await assertSucceeds(getDoc(ref(db, paths.people)));
    await assertSucceeds(setDoc(ref(db, `${root}/pessoas/nova`), { nome: 'Nova' }));
    await assertSucceeds(updateDoc(ref(db, paths.people), { nome: 'Alterada' }));
    await assertFails(deleteDoc(ref(db, paths.people)));
  });
  test('cria Membro no novo modelo e exige lifecycle auditado para alterar situação', async () => {
    const db = authDb('admin-a');
    const memberRef = ref(db, `${root}/pessoas/membro-9a-admin`);
    await assertSucceeds(setDoc(memberRef, canonicalMember()));
    await assertFails(updateDoc(memberRef, { ativo: false, atualizadoEm: new Date(), atualizadoPor: 'admin-a' }));
  });
  test('opera Agendas e consulentes', async () => {
    const db = authDb('admin-a');
    await assertSucceeds(getDoc(ref(db, paths.agendas)));
    await assertSucceeds(setDoc(ref(db, `${root}/agendas/nova`), { tipo: 'Nova' }));
    const batch = writeBatch(db);
    batch.set(ref(db, `${root}/consulentes/nova`), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-nova', status: 'Agendado' });
    batch.set(ref(db, `${root}/agendamentos_ativos/agenda-1_pessoa-nova`), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-nova', agendamentoId: 'nova', criadoEm: new Date(), criadoPor: 'admin-a' });
    await assertSucceeds(batch.commit());
    await assertSucceeds(updateDoc(ref(db, paths.agendas), { status: 'Concluída' }));
    await assertFails(deleteDoc(ref(db, paths.appointments)));
  });
  test('administra configurações sem excluir fisicamente', async () => {
    const db = authDb('admin-a');
    await assertSucceeds(setDoc(ref(db, `${root}/config_servicos/novo`), { nome: 'Novo' }));
    await assertSucceeds(updateDoc(ref(db, paths.config), { ativo: false }));
    await assertFails(deleteDoc(ref(db, paths.config)));
  });
  test('lista usuários e altera outro usuário', async () => {
    const db = authDb('admin-a');
    await assertSucceeds(getDocs(collection(db, `${root}/usuarios`)));
    await assertSucceeds(updateDoc(ref(db, paths.user('gestor')), { role: 'atendimento', atualizadoEm: new Date(), atualizadoPor: 'admin-a' }));
  });
  test('não altera o status de outro usuário sem lifecycle auditado', async () => assertFails(updateDoc(ref(authDb('admin-a'), paths.user('gestor')), { ativo: false, atualizadoEm: new Date(), atualizadoPor: 'admin-a' })));
  test('pode desativar usuário legado sem vínculo, sem alterar seu role', async () => {
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), `${root}/usuarios/legado-sem-vinculo`), { uid: 'legado-sem-vinculo', role: 'atendimento', ativo: true }));
    await assertFails(updateDoc(ref(authDb('admin-a'), `${root}/usuarios/legado-sem-vinculo`), { ativo: false, atualizadoEm: new Date(), atualizadoPor: 'admin-a' }));
    await assertFails(updateDoc(ref(authDb('admin-a'), `${root}/usuarios/legado-sem-vinculo`), { role: 'gestor', atualizadoEm: new Date(), atualizadoPor: 'admin-a' }));
  });
  test('não exclui usuário', async () => assertFails(deleteDoc(ref(authDb('admin-a'), paths.user('gestor')))));
  test('não altera UID de usuário', async () => assertFails(updateDoc(ref(authDb('admin-a'), paths.user('gestor')), { uid: 'fraude', atualizadoEm: new Date(), atualizadoPor: 'admin-a' })));
  test('não cria role inválido', async () => assertFails(updateDoc(ref(authDb('admin-a'), paths.user('gestor')), { role: 'superadmin', atualizadoEm: new Date(), atualizadoPor: 'admin-a' })));
  for (const role of ['gestor', 'atendimento', 'pendente']) {
    test(`Admin A não altera o próprio role para ${role}`, async () => assertFails(updateDoc(ref(authDb('admin-a'), paths.user('admin-a')), { role, atualizadoEm: new Date(), atualizadoPor: 'admin-a' })));
  }
  test('Admin A não desativa a própria conta', async () => assertFails(updateDoc(ref(authDb('admin-a'), paths.user('admin-a')), { ativo: false, atualizadoEm: new Date(), atualizadoPor: 'admin-a' })));
  test('Admin A altera Admin B', async () => assertSucceeds(updateDoc(ref(authDb('admin-a'), paths.user('admin-b')), { role: 'gestor', atualizadoEm: new Date(), atualizadoPor: 'admin-a' })));
});

describe('E. gestor', () => {
  test('não pode executar manutenção isolada do índice de busca', async () => {
    await assertFails(updateDoc(ref(authDb('gestor'), paths.people), { busca: { versao: 1, nome: 'fraude', telefone: '', termos: ['fr'] } }));
  });
  test('opera Pessoas, Agendas e Fluxo', async () => {
    const db = authDb('gestor');
    await assertSucceeds(updateDoc(ref(db, paths.people), { nome: 'Gestor editou', atualizadoEm: new Date(), atualizadoPor: 'gestor' }));
    await assertSucceeds(setDoc(ref(db, `${root}/agendas/gestor`), { tipo: 'Agenda' }));
    await assertSucceeds(updateDoc(ref(db, paths.appointments), { status: 'Presente' }));
  });
  test('cria e edita novos campos, mas Gestor não altera lifecycle de Membro', async () => {
    const db = authDb('gestor');
    const memberRef = ref(db, `${root}/pessoas/membro-9a-gestor`);
    await assertSucceeds(setDoc(memberRef, canonicalMember()));
    await assertSucceeds(updateDoc(memberRef, { sexo: 'feminino', estadoCivil: 'solteiro', endereco: { cep: '68900000', logradouro: 'Rua A', numero: '1', complemento: null, bairro: 'Centro', cidade: 'Macapá', uf: 'AP' }, dadosCasa: { dataIngresso: '2020-01-01', dataBatismoCaesf: null }, atualizadoEm: new Date(), atualizadoPor: 'gestor' }));
    await assertFails(updateDoc(memberRef, { ativo: false, atualizadoEm: new Date(), atualizadoPor: 'gestor' }));
  });
  test('Gestor não atualiza Pessoa com campo arbitrário', async () => {
    await assertFails(updateDoc(ref(authDb('gestor'), paths.people), { sexo: 'masculino', campoNaoPermitido: 'teste', atualizadoEm: new Date(), atualizadoPor: 'gestor' }));
  });
  test('não administra configurações', async () => assertFails(updateDoc(ref(authDb('gestor'), paths.config), { ativo: false })));
  test('não lista usuários', async () => assertFails(getDocs(collection(authDb('gestor'), `${root}/usuarios`))));
  test('não cria auditoria', async () => assertFails(setDoc(ref(authDb('gestor'), `${root}/auditoria/gestor`), { tipo: 'USUARIO_ROLE_ALTERADO', executadoPor: 'gestor' })));
  test('não altera roles', async () => assertFails(updateDoc(ref(authDb('gestor'), paths.user('atendimento')), { role: 'gestor' })));
});

describe('F. atendimento', () => {
  test('lê Pessoas e dados necessários ao atendimento', async () => {
    const db = authDb('atendimento');
    await assertSucceeds(getDoc(ref(db, paths.people)));
    await assertSucceeds(getDoc(ref(db, paths.agendas)));
    await assertSucceeds(getDoc(ref(db, paths.config)));
  });
  test('opera Fluxo e somente os campos permitidos da agenda', async () => {
    const db = authDb('atendimento');
    await assertSucceeds(updateDoc(ref(db, paths.appointments), { status: 'Presente' }));
    await assertSucceeds(updateDoc(ref(db, paths.agendas), { vagasOcupadas: { s1: 1 }, atualizadoEm: new Date(), atualizadoPor: 'atendimento' }));
  });
  test('cadastra e edita somente dados básicos de Consulente', async () => {
    const db = authDb('atendimento');
    await assertSucceeds(setDoc(ref(db, `${root}/pessoas/nova`), { nome: 'Nova', vinculo: 'consulente', tipoPessoa: 'Consulente', funcoesCasa: [], ativo: true }));
    await assertSucceeds(updateDoc(ref(db, paths.people), { nome: 'Nome corrigido', atualizadoEm: new Date(), atualizadoPor: 'atendimento' }));
    await assertFails(setDoc(ref(db, `${root}/pessoas/membro-proibido`), { nome: 'Membro', vinculo: 'membro', tipoPessoa: 'Membro', funcoesCasa: [], ativo: true }));
    await assertFails(updateDoc(ref(db, paths.people), { vinculo: 'membro', tipoPessoa: 'Membro', atualizadoEm: new Date(), atualizadoPor: 'atendimento' }));
    await assertFails(updateDoc(ref(db, `${root}/pessoas/membro-autorizacao`), { sexo: 'feminino', atualizadoEm: new Date(), atualizadoPor: 'atendimento' }));
    await assertFails(updateDoc(ref(db, `${root}/pessoas/membro-autorizacao`), { ativo: false, atualizadoEm: new Date(), atualizadoPor: 'atendimento' }));
    await assertFails(updateDoc(ref(db, `${root}/pessoas/membro-inativo`), { ativo: true, atualizadoEm: new Date(), atualizadoPor: 'atendimento' }));
  });
  test('não cria agendas', async () => assertFails(setDoc(ref(authDb('atendimento'), `${root}/agendas/nova`), { tipo: 'Nova' })));
  test('não administra configurações nem usuários', async () => {
    const db = authDb('atendimento');
    await assertFails(updateDoc(ref(db, paths.config), { ativo: false }));
    await assertFails(getDocs(collection(db, `${root}/usuarios`)));
  });
});

describe('G. criação do próprio perfil', () => {
  const validProfile = uid => ({ uid, nome: 'Novo', email: `${uid}@example.test`, role: 'pendente', ativo: true, criadoEm: new Date(), atualizadoEm: new Date() });
  for (const role of ['pendente', 'admin', 'gestor', 'atendimento']) {
    test(`recusa autocriar perfil com role ${role}`, async () => {
      const uid = `novo-${role}`;
      await assertFails(setDoc(ref(authDb(uid, { email: `${uid}@example.test` }), paths.user(uid)), { ...validProfile(uid), role }));
    });
  }
});

describe('G2. autorização institucional de acesso', () => {
  const pessoaId = 'membro-novo-acesso';
  const email = 'novo-acesso@example.test';
  const authorization = (overrides = {}) => ({ pessoaBaseId: pessoaId, email, role: 'atendimento', status: 'pendente', criadoEm: new Date(), criadoPor: 'admin-a', atualizadoEm: new Date(), atualizadoPor: 'admin-a', auditoriaPreautorizacaoId: 'preauth-audit', ...overrides });
  const seedMember = async () => environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), `${root}/pessoas/${pessoaId}`), { nome: 'Novo Acesso', email, vinculo: 'membro', ativo: true }));

  test('somente Admin cria e lista pré-autorização válida com auditoria', async () => {
    await seedMember();
    const admin = authDb('admin-a'); const batch = writeBatch(admin);
    batch.set(ref(admin, authorizationPath(pessoaId)), authorization());
    batch.set(ref(admin, `${root}/auditoria/preauth-audit`), { tipo: 'USUARIO_ACESSO_PREAUTORIZADO', pessoaBaseId: pessoaId, email, role: 'atendimento', executadoPor: 'admin-a', criadoEm: new Date() });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDocs(collection(admin, `${root}/autorizacoes_acesso`)));
    for (const uid of ['gestor', 'atendimento']) await assertFails(setDoc(ref(authDb(uid), authorizationPath(`${pessoaId}-${uid}`)), authorization({ pessoaBaseId: `${pessoaId}-${uid}`, criadoPor: uid, atualizadoPor: uid })));
  });

  test('bloqueia pré-autorização para e-mail inválido e duplicação pendente', async () => {
    const invalidId = `${pessoaId}-email-invalido`;
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), `${root}/pessoas/${invalidId}`), { nome: 'Sem Email Válido', email: 'email-invalido', vinculo: 'membro', ativo: true }));
    const admin = authDb('admin-a');
    const invalidBatch = writeBatch(admin);
    invalidBatch.set(ref(admin, authorizationPath(invalidId)), authorization({ pessoaBaseId: invalidId, email: 'email-invalido', auditoriaPreautorizacaoId: 'preauth-invalid' }));
    invalidBatch.set(ref(admin, `${root}/auditoria/preauth-invalid`), { tipo: 'USUARIO_ACESSO_PREAUTORIZADO', pessoaBaseId: invalidId, email: 'email-invalido', role: 'atendimento', executadoPor: 'admin-a', criadoEm: new Date() });
    await assertFails(invalidBatch.commit());

    await seedMember();
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), authorizationPath(pessoaId)), authorization()));
    await assertFails(updateDoc(ref(admin, authorizationPath(pessoaId)), { atualizadoEm: new Date(), atualizadoPor: 'admin-a' }));
  });

  test('conta sem perfil lê somente autorização pendente do próprio e-mail verificado', async () => {
    await seedMember();
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), authorizationPath(pessoaId)), authorization()));
    const ownDb = authDb('novo-uid', { email, email_verified: true });
    await assertSucceeds(getDocs(query(collection(ownDb, `${root}/autorizacoes_acesso`), where('email', '==', email), where('status', '==', 'pendente'), limit(2))));
    await assertFails(getDoc(ref(authDb('outro-uid', { email: 'outro@example.test' }), authorizationPath(pessoaId))));
    await assertFails(getDoc(ref(authDb('nao-verificado', { email, email_verified: false }), authorizationPath(pessoaId))));
    await assertFails(getDocs(collection(ownDb, `${root}/autorizacoes_acesso`)));
  });

  test('somente Admin cancela autorização pendente com auditoria', async () => {
    await seedMember();
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), authorizationPath(pessoaId)), authorization()));
    const gestor = authDb('gestor');
    await assertFails(updateDoc(ref(gestor, authorizationPath(pessoaId)), { status: 'cancelado', canceladoEm: new Date(), canceladoPor: 'gestor', atualizadoEm: new Date(), atualizadoPor: 'gestor', auditoriaCancelamentoId: 'cancel-gestor' }));
    const admin = authDb('admin-a'); const batch = writeBatch(admin);
    batch.update(ref(admin, authorizationPath(pessoaId)), { status: 'cancelado', canceladoEm: new Date(), canceladoPor: 'admin-a', atualizadoEm: new Date(), atualizadoPor: 'admin-a', auditoriaCancelamentoId: 'cancel-admin' });
    batch.set(ref(admin, `${root}/auditoria/cancel-admin`), { tipo: 'USUARIO_ACESSO_AUTORIZACAO_CANCELADA', pessoaBaseId: pessoaId, executadoPor: 'admin-a', criadoEm: new Date() });
    await assertSucceeds(batch.commit());
  });

  test('claim correto cria usuário, índice e auditoria e consome autorização atomicamente', async () => {
    await seedMember();
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), authorizationPath(pessoaId)), authorization()));
    const uid = 'novo-uid'; const db = authDb(uid, { email, email_verified: true }); const now = new Date(); const batch = writeBatch(db);
    batch.set(ref(db, paths.user(uid)), { uid, pessoaBaseId: pessoaId, nome: 'Novo Acesso', email, role: 'atendimento', ativo: true, criadoEm: now, criadoPor: uid, autorizadoPor: 'admin-a', atualizadoEm: now, atualizadoPor: uid });
    batch.set(ref(db, `${root}/usuario_pessoa_index/${pessoaId}`), { pessoaBaseId: pessoaId, uid, criadoEm: now, criadoPor: uid });
    batch.update(ref(db, authorizationPath(pessoaId)), { status: 'utilizado', utilizadoEm: now, utilizadoPorUid: uid, atualizadoEm: now, atualizadoPor: uid });
    batch.set(ref(db, `${root}/auditoria/usuario_ativado_${uid}_${pessoaId}`), { tipo: 'USUARIO_ACESSO_ATIVADO', alvoUid: uid, pessoaBaseId: pessoaId, role: 'atendimento', autorizadoPor: 'admin-a', executadoPor: uid, criadoEm: now });
    await assertSucceeds(batch.commit());
  });

  test('nega claim parcial, role divergente, e-mail errado, não verificado, cancelado e utilizado', async () => {
    await seedMember();
    for (const [suffix, claims, authOverrides, userOverrides, omit] of [
      ['role', { email }, {}, { role: 'admin' }, null], ['email', { email: 'errado@example.test' }, {}, {}, null],
      ['unverified', { email, email_verified: false }, {}, {}, null], ['cancelled', { email }, { status: 'cancelado' }, {}, null],
      ['used', { email }, { status: 'utilizado' }, {}, null], ['no-index', { email }, {}, {}, 'index'], ['no-audit', { email }, {}, {}, 'audit'], ['no-consume', { email }, {}, {}, 'authorization']
    ]) {
      const id = `${pessoaId}-${suffix}`; const uid = `uid-${suffix}`;
      await environment.withSecurityRulesDisabled(async context => { const db = context.firestore(); await setDoc(ref(db, `${root}/pessoas/${id}`), { nome: 'Novo Acesso', email, vinculo: 'membro', ativo: true }); await setDoc(ref(db, authorizationPath(id)), authorization({ pessoaBaseId: id, ...authOverrides })); });
      const db = authDb(uid, { email_verified: true, ...claims }); const now = new Date(); const batch = writeBatch(db);
      batch.set(ref(db, paths.user(uid)), { uid, pessoaBaseId: id, nome: 'Novo Acesso', email, role: 'atendimento', ativo: true, criadoEm: now, criadoPor: uid, autorizadoPor: 'admin-a', atualizadoEm: now, atualizadoPor: uid, ...userOverrides });
      if (omit !== 'index') batch.set(ref(db, `${root}/usuario_pessoa_index/${id}`), { pessoaBaseId: id, uid, criadoEm: now, criadoPor: uid });
      if (omit !== 'authorization') batch.update(ref(db, authorizationPath(id)), { status: 'utilizado', utilizadoEm: now, utilizadoPorUid: uid, atualizadoEm: now, atualizadoPor: uid });
      if (omit !== 'audit') batch.set(ref(db, `${root}/auditoria/usuario_ativado_${uid}_${id}`), { tipo: 'USUARIO_ACESSO_ATIVADO', alvoUid: uid, pessoaBaseId: id, role: 'atendimento', autorizadoPor: 'admin-a', executadoPor: uid, criadoEm: now });
      await assertFails(batch.commit());
    }
  });
});

describe('H. auditoria', () => {
  const audit = { tipo: 'USUARIO_STATUS_ALTERADO', alvoUid: 'gestor', valorAnterior: true, valorNovo: false, executadoPor: 'admin-a', criadoEm: new Date() };
  test('admin cria evento válido', async () => assertSucceeds(setDoc(ref(authDb('admin-a'), `${root}/auditoria/novo`), audit)));
  test('admin não cria evento com executor falso', async () => assertFails(setDoc(ref(authDb('admin-a'), `${root}/auditoria/falso`), { ...audit, executadoPor: 'admin-b' })));
  test('não-admin não cria evento', async () => assertFails(setDoc(ref(authDb('gestor'), `${root}/auditoria/novo`), { ...audit, executadoPor: 'gestor' })));
  test('auditoria existente não pode ser editada', async () => assertFails(updateDoc(ref(authDb('admin-a'), paths.audit), { valorNovo: 'fraude' })));
  test('auditoria existente não pode ser excluída', async () => assertFails(deleteDoc(ref(authDb('admin-a'), paths.audit))));
});

describe('I. integridade operacional', () => {
  test('perfil interno cria auditoria operacional em seu próprio nome', async () => {
    const event = { tipo: 'AGENDAMENTO_CANCELADO', alvoId: 'consulta-1', agendaId: 'agenda-1', executadoPor: 'gestor', criadoEm: new Date() };
    await assertSucceeds(setDoc(ref(authDb('gestor'), `${root}/auditoria/cancelamento`), event));
  });
  test('atendimento cria auditoria operacional, mas não auditoria de usuário', async () => {
    const db = authDb('atendimento');
    await assertSucceeds(setDoc(ref(db, `${root}/auditoria/prioridade`), { tipo: 'PRIORIDADE_ALTERADA', executadoPor: 'atendimento', criadoEm: new Date() }));
    await assertFails(setDoc(ref(db, `${root}/auditoria/usuario`), { tipo: 'USUARIO_STATUS_ALTERADO', executadoPor: 'atendimento', criadoEm: new Date() }));
  });
  test('agenda concluída bloqueia novos agendamentos e alterações', async () => {
    const db = authDb('admin-a');
    await assertSucceeds(updateDoc(ref(db, paths.agendas), { status: 'Concluída' }));
    await assertFails(setDoc(ref(db, `${root}/consulentes/nova`), { agendaId: 'agenda-1', status: 'Agendado' }));
    await assertFails(updateDoc(ref(db, paths.appointments), { status: 'Presente' }));
    await assertFails(updateDoc(ref(db, paths.agendas), { tipo: 'Alteração tardia' }));
  });
  test('nenhum perfil exclui fisicamente um agendamento', async () => {
    await assertFails(deleteDoc(ref(authDb('admin-a'), paths.appointments)));
    await assertFails(deleteDoc(ref(authDb('gestor'), paths.appointments)));
    await assertFails(deleteDoc(ref(authDb('atendimento'), paths.appointments)));
  });
});

describe('J. modelo operacional da Casa', () => {
  test('admin cria configuração de função de membro', async () => {
    await assertSucceeds(setDoc(ref(authDb('admin-a'), `${root}/config_funcoes_membro/medium`), { codigo: 'medium', nome: 'Médium', ativo: true }));
    await assertFails(setDoc(ref(authDb('gestor'), `${root}/config_funcoes_membro/cambone`), { codigo: 'cambone', nome: 'Cambone', ativo: true }));
  });
  test('agenda cancelada fica protegida contra atualizações e agendamentos', async () => {
    const db = authDb('admin-a');
    await assertSucceeds(updateDoc(ref(db, paths.agendas), { status: 'Cancelada', canceladaPor: 'admin-a', canceladaEm: new Date() }));
    await assertFails(updateDoc(ref(db, paths.agendas), { tipo: 'Alterada' }));
    await assertFails(updateDoc(ref(db, paths.appointments), { status: 'Presente' }));
    await assertFails(setDoc(ref(db, `${root}/consulentes/novo-cancelada`), { agendaId: 'agenda-1', status: 'Agendado' }));
  });
  test('somente admin exclui fisicamente agenda', async () => {
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(ref(context.firestore(), `${root}/agendas/vazia-admin`), { tipo: 'Vazia', status: 'Agendada' });
      await setDoc(ref(context.firestore(), `${root}/agendas/vazia-gestor`), { tipo: 'Vazia', status: 'Agendada' });
    });
    await assertFails(deleteDoc(ref(authDb('gestor'), `${root}/agendas/vazia-gestor`)));
    await assertSucceeds(deleteDoc(ref(authDb('admin-a'), `${root}/agendas/vazia-admin`)));
  });
  test('eventos operacionais novos são imutáveis', async () => {
    const db = authDb('gestor');
    const auditRef = ref(db, `${root}/auditoria/agenda-editada`);
    await assertSucceeds(setDoc(auditRef, { tipo: 'AGENDA_EDITADA', agendaId: 'agenda-1', executadoPor: 'gestor', criadoEm: new Date() }));
    await assertFails(updateDoc(auditRef, { agendaId: 'fraude' }));
    await assertFails(deleteDoc(auditRef));
  });
});

describe('K. correção administrativa de status', () => {
  test('somente admin corrige transição permitida com campos restritos, inclusive em agenda concluída', async () => {
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(ref(context.firestore(), paths.agendas), { tipo: 'Agenda', status: 'Concluída' });
      await setDoc(ref(context.firestore(), paths.appointments), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-1', status: 'Concluído', horaChegada: new Date(), horaSaida: new Date() });
    });
    await assertFails(updateDoc(ref(authDb('gestor'), paths.appointments), { status: 'Presente', horaSaida: null, atualizadoPor: 'gestor' }));
    await assertFails(updateDoc(ref(authDb('atendimento'), paths.appointments), { status: 'Presente', horaSaida: null, atualizadoPor: 'atendimento' }));
    await assertFails(updateDoc(ref(authDb('admin-a'), paths.appointments), { status: 'Faltou', atualizadoPor: 'admin-a' }));
    await assertFails(updateDoc(ref(authDb('admin-a'), paths.appointments), { status: 'Presente', pessoaBaseId: 'fraude', atualizadoPor: 'admin-a' }));
    await assertSucceeds(updateDoc(ref(authDb('admin-a'), paths.appointments), { status: 'Presente', horaSaida: deleteField(), atualizadoEm: new Date(), atualizadoPor: 'admin-a' }));
  });
  test('agenda cancelada não permite correção e auditoria nova é exclusiva do admin e imutável', async () => {
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(ref(context.firestore(), paths.agendas), { tipo: 'Agenda', status: 'Cancelada' });
      await setDoc(ref(context.firestore(), paths.appointments), { agendaId: 'agenda-1', status: 'Concluído' });
    });
    await assertFails(updateDoc(ref(authDb('admin-a'), paths.appointments), { status: 'Presente', atualizadoPor: 'admin-a' }));
    const event = { tipo: 'STATUS_ATENDIMENTO_CORRIGIDO', agendaId: 'agenda-1', alvoId: 'consulta-1', statusAnterior: 'Concluído', statusNovo: 'Presente', motivo: 'Erro humano', executadoPor: 'admin-a', criadoEm: new Date() };
    const auditRef = ref(authDb('admin-a'), `${root}/auditoria/correcao-status`);
    await assertFails(setDoc(ref(authDb('gestor'), `${root}/auditoria/correcao-gestor`), { ...event, executadoPor: 'gestor' }));
    await assertSucceeds(setDoc(auditRef, event));
    await assertFails(updateDoc(auditRef, { motivo: 'Alterado' }));
    await assertFails(deleteDoc(auditRef));
  });
});

describe('L. lock de agendamento ativo', () => {
  test('cria atendimento e lock correspondentes na mesma operação', async () => {
    const db = authDb('admin-a');
    const batch = writeBatch(db);
    batch.set(ref(db, `${root}/consulentes/novo-lock`), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-1', status: 'Agendado' });
    batch.set(ref(db, `${root}/agendamentos_ativos/agenda-1_pessoa-1`), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-1', agendamentoId: 'novo-lock', criadoEm: new Date(), criadoPor: 'admin-a' });
    await assertSucceeds(batch.commit());
  });
  test('recusa atendimento sem lock, lock falso e update arbitrário', async () => {
    const db = authDb('admin-a');
    await assertFails(setDoc(ref(db, `${root}/consulentes/sem-lock`), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-sem-lock', status: 'Agendado' }));
    await assertFails(setDoc(ref(db, `${root}/agendamentos_ativos/lock-falso`), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-1', agendamentoId: 'inexistente', criadoEm: new Date(), criadoPor: 'admin-a' }));
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), `${root}/agendamentos_ativos/lock-existente`), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-1', agendamentoId: 'consulta-1' }));
    await assertFails(updateDoc(ref(db, `${root}/agendamentos_ativos/lock-existente`), { agendamentoId: 'fraude' }));
  });
  test('remove lock somente ao cancelar o atendimento apontado e não reativa Cancelado', async () => {
    const db = authDb('admin-a');
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), `${root}/agendamentos_ativos/agenda-1_pessoa-1`), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-1', agendamentoId: 'consulta-1' }));
    await assertFails(deleteDoc(ref(db, `${root}/agendamentos_ativos/agenda-1_pessoa-1`)));
    const batch = writeBatch(db);
    batch.update(ref(db, paths.appointments), { status: 'Cancelado', canceladoEm: new Date(), canceladoPor: 'admin-a', atualizadoEm: new Date(), atualizadoPor: 'admin-a' });
    batch.delete(ref(db, `${root}/agendamentos_ativos/agenda-1_pessoa-1`));
    await assertSucceeds(batch.commit());
    await assertFails(updateDoc(ref(db, paths.appointments), { status: 'Agendado', atualizadoEm: new Date(), atualizadoPor: 'admin-a' }));
  });
});

async function seedRelocationOrigin() {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(ref(db, paths.agendas), { tipo: 'Origem', status: 'Aberta', vagasOcupadas: { 'servico-a': 1 } }),
      setDoc(ref(db, paths.appointments), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-1', nome: 'Pessoa', status: 'Agendado', servicosIds: ['servico-a'], servicosNomes: ['Serviço A'] }),
      setDoc(ref(db, `${root}/agendas/agenda-2`), { tipo: 'Destino', status: 'Aberta', vagasOcupadas: { 'servico-a': 0 } }),
      setDoc(ref(db, `${root}/agendamentos_ativos/agenda-1_pessoa-1`), { agendaId: 'agenda-1', pessoaBaseId: 'pessoa-1', agendamentoId: 'consulta-1' })
    ]);
  });
}

function relocationBatch(uid, options = {}) {
  const db = authDb(uid);
  const relocationId = options.relocationId || `realocacao-${uid}`;
  const destinationId = options.auditDestinationId || 'destino-1';
  const sourceDestinationId = options.sourceDestinationId || 'destino-1';
  const auditedServices = options.auditServices || ['servico-a'];
  const sourceServices = options.extraSourceService ? ['servico-a', 'servico-fraude'] : ['servico-a'];
  const now = new Date();
  const entry = () => ({ realocacaoId: relocationId, destinoAgendaId: 'agenda-2', destinoAgendamentoId: sourceDestinationId, realocadoEm: now, realocadoPor: uid, motivo: 'Realocação segura' });
  const batch = writeBatch(db);
  batch.update(ref(db, paths.appointments), {
    status: 'Reagendado', ultimaRealocacaoId: relocationId,
    servicosRealocados: Object.fromEntries(sourceServices.map(serviceId => [serviceId, entry(serviceId)])),
    reagendadoEm: now, reagendadoPor: uid, reagendadoParaAgendaId: 'agenda-2',
    reagendadoParaAgendamentoId: sourceDestinationId, motivoRealocacao: 'Realocação segura', atualizadoEm: now, atualizadoPor: uid
  });
  if (!options.omitDestination) batch.set(ref(db, `${root}/consulentes/destino-1`), {
    agendaId: 'agenda-2', pessoaBaseId: 'pessoa-1', nome: 'Pessoa', status: 'Agendado', servicosIds: ['servico-a'], servicosNomes: ['Serviço A'],
    origemRealocacao: { realocacaoId: relocationId, agendaId: 'agenda-1', agendamentoId: options.wrongOrigin ? 'outro' : 'consulta-1', tipo: 'completa', realocadoEm: now, realocadoPor: uid, motivo: 'Realocação segura' }
  });
  if (!options.omitDestination) batch.set(ref(db, `${root}/agendamentos_ativos/agenda-2_pessoa-1`), { agendaId: 'agenda-2', pessoaBaseId: 'pessoa-1', agendamentoId: 'destino-1', criadoEm: now, criadoPor: uid });
  if (!options.keepOriginLock) batch.delete(ref(db, `${root}/agendamentos_ativos/agenda-1_pessoa-1`));
  if (!options.omitAudit) batch.set(ref(db, `${root}/auditoria/${relocationId}`), {
    tipo: 'ATENDIMENTO_REAGENDADO', realocacaoId: relocationId, origemAgendaId: 'agenda-1', origemAgendamentoId: options.wrongAuditOrigin ? 'outro' : 'consulta-1',
    destinoAgendaId: 'agenda-2', destinoAgendamentoId: destinationId, servicosIds: auditedServices,
    motivo: 'Realocação segura', executadoPor: uid, criadoEm: now
  });
  return batch;
}

describe('M. integridade transacional da realocação', () => {
  test('admin e gestor realocam somente com origem, destino, lock e auditoria coerentes', async () => {
    await seedRelocationOrigin();
    await assertSucceeds(relocationBatch('admin-a').commit());
    await environment.clearFirestore(); await seed(); await seedRelocationOrigin();
    await assertSucceeds(relocationBatch('gestor').commit());
  });
  test('atendimento e pendente não realocam', async () => {
    await seedRelocationOrigin();
    await assertFails(relocationBatch('atendimento').commit());
    await assertFails(relocationBatch('pendente').commit());
  });
  test('bloqueia origem sem destino ou sem auditoria', async () => {
    await seedRelocationOrigin();
    await assertFails(relocationBatch('admin-a', { omitDestination: true }).commit());
    await assertFails(relocationBatch('admin-a', { omitAudit: true }).commit());
  });
  test('bloqueia serviço extra, destinos divergentes e auditoria apontando para outra origem', async () => {
    await seedRelocationOrigin();
    await assertFails(relocationBatch('admin-a', { extraSourceService: true }).commit());
    await assertFails(relocationBatch('admin-a', { sourceDestinationId: 'outro-destino' }).commit());
    await assertFails(relocationBatch('admin-a', { wrongOrigin: true }).commit());
    await assertFails(relocationBatch('admin-a', { wrongAuditOrigin: true }).commit());
  });
  test('bloqueia reutilização de realocacaoId e remoção isolada do lock', async () => {
    await seedRelocationOrigin();
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), `${root}/auditoria/reutilizado`), { tipo: 'SERVICO_REALOCADO' }));
    await assertFails(relocationBatch('admin-a', { relocationId: 'reutilizado' }).commit());
    await assertFails(deleteDoc(ref(authDb('admin-a'), `${root}/agendamentos_ativos/agenda-1_pessoa-1`)));
  });
});

describe('N. Meu Cadastro', () => {
  const ownPath = `${root}/pessoas/meu-cadastro-atendimento`;
  const otherPath = `${root}/pessoas/meu-cadastro-alheio`;
  const address = { cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null };
  const metadata = { atualizadoEm: new Date(), atualizadoPor: 'atendimento' };

  beforeEach(async () => environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await updateDoc(ref(db, paths.user('atendimento')), { pessoaBaseId: 'meu-cadastro-atendimento' });
    await setDoc(ref(db, ownPath), canonicalMember({ contato: null, estadoCivil: 'nao_informado', endereco: address }));
    await setDoc(ref(db, otherPath), canonicalMember({ nome: 'Outro membro', cpf: '98765432100', endereco: address }));
  }));

  test('usuário vinculado lê a própria Pessoa', async () => {
    await assertSucceeds(getDoc(ref(authDb('atendimento'), ownPath)));
  });

  test('altera contato, estado civil e endereço, isolados ou combinados', async () => {
    const db = authDb('atendimento');
    await assertSucceeds(updateDoc(ref(db, ownPath), { contato: '11999999999', ...metadata }));
    await assertSucceeds(updateDoc(ref(db, ownPath), { estadoCivil: 'casado', ...metadata }));
    await assertSucceeds(updateDoc(ref(db, ownPath), {
      contato: '11888888888', estadoCivil: 'uniao_estavel',
      endereco: { cep: '01001000', logradouro: 'Praça da Sé', numero: '1', complemento: null, bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' },
      ...metadata
    }));
  });

  for (const [campo, valor] of [
    ['nome', 'Nome fraudado'], ['cpf', '11111111111'], ['email', 'fraude@example.test'],
    ['vinculo', 'consulente'], ['funcoesCasa', []], ['dadosCasa', {}], ['ativo', false],
    ['statusCadastro', 'rejeitado'], ['origemCadastro', 'fraude']
  ]) {
    test(`nega alteração própria de ${campo}`, async () => {
      await assertFails(updateDoc(ref(authDb('atendimento'), ownPath), { [campo]: valor, ...metadata }));
    });
  }

  test('nega atualização da Pessoa alheia', async () => {
    await assertFails(updateDoc(ref(authDb('atendimento'), otherPath), { contato: '11999999999', ...metadata }));
  });

  test('aceita auditoria mínima e nega dados pessoais adicionais', async () => {
    const db = authDb('atendimento');
    const audit = { tipo: 'MEU_CADASTRO_ATUALIZADO', pessoaBaseId: 'meu-cadastro-atendimento', camposAlterados: ['contato'], executadoPor: 'atendimento', criadoEm: new Date() };
    await assertSucceeds(setDoc(ref(db, `${root}/auditoria/meu-cadastro-ok`), audit));
    await assertFails(setDoc(ref(db, `${root}/auditoria/meu-cadastro-pii`), { ...audit, valorAnterior: '11999999999' }));
  });

  test('admin e gestor mantêm as permissões administrativas existentes', async () => {
    await assertSucceeds(updateDoc(ref(authDb('admin-a'), otherPath), { nome: 'Alterado pelo admin' }));
    await assertSucceeds(updateDoc(ref(authDb('gestor'), otherPath), { nome: 'Alterado pelo gestor', atualizadoEm: new Date(), atualizadoPor: 'gestor' }));
  });
});

describe('O. Fase 9H - lifecycle e revogação', () => {
  const memberLifecycleBatch = (pessoaId, active, auditId, reason = null) => {
    const db = authDb('admin-a'); const batch = writeBatch(db); const now = new Date();
    batch.update(ref(db, `${root}/pessoas/${pessoaId}`), active
      ? { ativo: true, reativadoEm: now, reativadoPor: 'admin-a', auditoriaLifecycleId: auditId, atualizadoEm: now, atualizadoPor: 'admin-a' }
      : { ativo: false, inativadoEm: now, inativadoPor: 'admin-a', motivoInativacao: reason, auditoriaLifecycleId: auditId, atualizadoEm: now, atualizadoPor: 'admin-a' });
    batch.set(ref(db, `${root}/auditoria/${auditId}`), { tipo: active ? 'MEMBRO_REATIVADO' : 'MEMBRO_INATIVADO', pessoaBaseId: pessoaId, ...(reason ? { motivo: reason } : {}), executadoPor: 'admin-a', criadoEm: now });
    return batch;
  };
  const userLifecycleBatch = (uid, active, auditId, reason = null, pessoaBaseId = `membro-${uid}`) => {
    const db = authDb('admin-a'); const batch = writeBatch(db); const now = new Date();
    batch.update(ref(db, paths.user(uid)), active
      ? { ativo: true, acessoReativadoEm: now, acessoReativadoPor: 'admin-a', auditoriaLifecycleId: auditId, atualizadoEm: now, atualizadoPor: 'admin-a' }
      : { ativo: false, acessoRevogadoEm: now, acessoRevogadoPor: 'admin-a', motivoRevogacao: reason, auditoriaLifecycleId: auditId, atualizadoEm: now, atualizadoPor: 'admin-a' });
    batch.set(ref(db, `${root}/auditoria/${auditId}`), { tipo: active ? 'USUARIO_ACESSO_REATIVADO' : 'USUARIO_ACESSO_REVOGADO', alvoUid: uid, ...(pessoaBaseId ? { pessoaBaseId } : {}), ...(reason ? { motivo: reason } : {}), executadoPor: 'admin-a', criadoEm: now });
    return batch;
  };

  test('Admin inativa e reativa Membro com auditoria, preservando os demais dados', async () => {
    await assertSucceeds(memberLifecycleBatch('membro-gestor', false, 'membro-off', 'Afastamento').commit());
    const inactive = (await getDoc(ref(authDb('admin-a'), `${root}/pessoas/membro-gestor`))).data();
    assert.equal(inactive.ativo, false); assert.equal(inactive.cpf, '12345678900'); assert.deepEqual(inactive.funcoesCasa, ['medium']);
    await assertSucceeds(memberLifecycleBatch('membro-gestor', true, 'membro-on').commit());
  });

  test('motivo é obrigatório e Gestor/Atendimento não alteram lifecycle', async () => {
    await assertFails(memberLifecycleBatch('membro-gestor', false, 'sem-motivo').commit());
    for (const uid of ['gestor', 'atendimento']) await assertFails(updateDoc(ref(authDb(uid), `${root}/pessoas/membro-admin-b`), { ativo: false, atualizadoEm: new Date(), atualizadoPor: uid }));
  });

  test('Admin não inativa a própria Pessoa vinculada', async () => {
    await assertFails(memberLifecycleBatch('membro-admin-a', false, 'self-member', 'Fraude').commit());
  });

  test('Membro inativo bloqueia imediatamente o usuário vinculado e reativação restaura elegibilidade', async () => {
    await assertSucceeds(memberLifecycleBatch('membro-gestor', false, 'suspende-gestor', 'Afastamento').commit());
    await assertFails(getDoc(ref(authDb('gestor'), paths.people)));
    await assertSucceeds(memberLifecycleBatch('membro-gestor', true, 'restaura-gestor').commit());
    await assertSucceeds(getDoc(ref(authDb('gestor'), paths.people)));
  });

  test('Admin revoga e reativa acesso sem alterar role, vínculo ou índice', async () => {
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), `${root}/usuario_pessoa_index/membro-gestor`), { uid: 'gestor', pessoaBaseId: 'membro-gestor' }));
    await assertSucceeds(userLifecycleBatch('gestor', false, 'access-off', 'Revogação institucional').commit());
    await assertFails(getDoc(ref(authDb('gestor'), paths.people)));
    const revoked = (await getDoc(ref(authDb('admin-a'), paths.user('gestor')))).data();
    assert.equal(revoked.role, 'gestor'); assert.equal(revoked.pessoaBaseId, 'membro-gestor');
    await assertSucceeds(userLifecycleBatch('gestor', true, 'access-on').commit());
    assert.equal((await getDoc(ref(authDb('admin-a'), `${root}/usuario_pessoa_index/membro-gestor`))).exists(), true);
  });

  test('não reativa acesso com Pessoa inativa e não revoga o próprio acesso', async () => {
    await assertSucceeds(userLifecycleBatch('gestor', false, 'access-off-2', 'Revogação').commit());
    await assertSucceeds(memberLifecycleBatch('membro-gestor', false, 'member-off-2', 'Afastamento').commit());
    await assertFails(userLifecycleBatch('gestor', true, 'access-on-invalid').commit());
    await assertFails(userLifecycleBatch('admin-a', false, 'self-access', 'Fraude', 'membro-admin-a').commit());
  });

  test('usuário legado pode ser revogado e reativado, e auditoria falsa é negada', async () => {
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), `${root}/usuarios/legado-9h`), { uid: 'legado-9h', role: 'atendimento', ativo: true }));
    await assertSucceeds(userLifecycleBatch('legado-9h', false, 'legacy-off', 'Revogação', null).commit());
    await assertSucceeds(userLifecycleBatch('legado-9h', true, 'legacy-on', null, null).commit());
    await assertFails(setDoc(ref(authDb('admin-a'), `${root}/auditoria/falsa-9h`), { tipo: 'MEMBRO_INATIVADO', pessoaBaseId: 'membro-gestor', motivo: 'Falso', executadoPor: 'admin-a', criadoEm: new Date() }));
  });
});
