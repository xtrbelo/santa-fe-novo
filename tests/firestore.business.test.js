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
  withPessoaSearchIndex
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
const adminDb = () => environment.authenticatedContext(USER_ID).firestore();

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
  await seedDocuments([['usuarios', USER_ID, { uid: USER_ID, role: 'admin', ativo: true }]]);
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
      const roleDb = environment.authenticatedContext(uid).firestore();
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
