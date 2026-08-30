import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

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

  test('pendente não verificado cria e lê o próprio perfil, sem acessar dados ou terceiros', async () => {
    const db = authDb('novo-nao-verificado', { email: 'novo@santafe.local', email_verified: false });
    const profile = { uid: 'novo-nao-verificado', nome: 'Novo', email: 'novo@santafe.local', role: 'pendente', ativo: true, criadoEm: new Date(), atualizadoEm: new Date() };
    await assertSucceeds(setDoc(ref(db, paths.user('novo-nao-verificado')), profile));
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
  test('cria Membro no novo modelo e Admin pode inativar e reativar', async () => {
    const db = authDb('admin-a');
    const memberRef = ref(db, `${root}/pessoas/membro-9a-admin`);
    await assertSucceeds(setDoc(memberRef, canonicalMember()));
    await assertSucceeds(updateDoc(memberRef, { ativo: false, atualizadoEm: new Date(), atualizadoPor: 'admin-a' }));
    await assertSucceeds(updateDoc(memberRef, { ativo: true, atualizadoEm: new Date(), atualizadoPor: 'admin-a' }));
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
  test('altera o status de outro usuário', async () => assertSucceeds(updateDoc(ref(authDb('admin-a'), paths.user('gestor')), { ativo: false, atualizadoEm: new Date(), atualizadoPor: 'admin-a' })));
  test('pode desativar usuário legado sem vínculo, sem alterar seu role', async () => {
    await environment.withSecurityRulesDisabled(async context => setDoc(ref(context.firestore(), `${root}/usuarios/legado-sem-vinculo`), { uid: 'legado-sem-vinculo', role: 'atendimento', ativo: true }));
    await assertSucceeds(updateDoc(ref(authDb('admin-a'), `${root}/usuarios/legado-sem-vinculo`), { ativo: false, atualizadoEm: new Date(), atualizadoPor: 'admin-a' }));
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
  test('cria, edita novos campos e Gestor pode inativar e reativar Membro', async () => {
    const db = authDb('gestor');
    const memberRef = ref(db, `${root}/pessoas/membro-9a-gestor`);
    await assertSucceeds(setDoc(memberRef, canonicalMember()));
    await assertSucceeds(updateDoc(memberRef, { sexo: 'feminino', estadoCivil: 'solteiro', endereco: { cep: '68900000', logradouro: 'Rua A', numero: '1', complemento: null, bairro: 'Centro', cidade: 'Macapá', uf: 'AP' }, dadosCasa: { dataIngresso: '2020-01-01', dataBatismoCaesf: null }, atualizadoEm: new Date(), atualizadoPor: 'gestor' }));
    await assertSucceeds(updateDoc(memberRef, { ativo: false, atualizadoEm: new Date(), atualizadoPor: 'gestor' }));
    await assertSucceeds(updateDoc(memberRef, { ativo: true, atualizadoEm: new Date(), atualizadoPor: 'gestor' }));
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
  test('aceita somente o perfil pendente válido', async () => assertSucceeds(setDoc(ref(authDb('novo', { email: 'novo@example.test' }), paths.user('novo')), validProfile('novo'))));
  test('aceita e-mail do Firestore igual ao e-mail do token Auth', async () => assertSucceeds(setDoc(ref(authDb('novo-email', { email: 'novo-email@example.test' }), paths.user('novo-email')), validProfile('novo-email'))));
  test('recusa e-mail do Firestore diferente do token Auth', async () => assertFails(setDoc(ref(authDb('email-falso', { email: 'real@example.test' }), paths.user('email-falso')), { ...validProfile('email-falso'), email: 'falso@example.test' })));
  test('recusa token autenticado sem e-mail', async () => assertFails(setDoc(ref(authDb('sem-email'), paths.user('sem-email')), validProfile('sem-email'))));
  test('recusa role admin', async () => assertFails(setDoc(ref(authDb('novo', { email: 'novo@example.test' }), paths.user('novo')), { ...validProfile('novo'), role: 'admin' })));
  test('recusa role gestor', async () => assertFails(setDoc(ref(authDb('novo', { email: 'novo@example.test' }), paths.user('novo')), { ...validProfile('novo'), role: 'gestor' })));
  test('recusa usuário inativo', async () => assertFails(setDoc(ref(authDb('novo', { email: 'novo@example.test' }), paths.user('novo')), { ...validProfile('novo'), ativo: false })));
  test('recusa UID diferente', async () => assertFails(setDoc(ref(authDb('novo', { email: 'novo@example.test' }), paths.user('novo')), { ...validProfile('outro'), email: 'novo@example.test' })));
  test('recusa campos não permitidos', async () => assertFails(setDoc(ref(authDb('novo', { email: 'novo@example.test' }), paths.user('novo')), { ...validProfile('novo'), roleAdmin: true })));
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
