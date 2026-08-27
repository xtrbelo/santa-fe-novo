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
  updateAtendimentoStatus
} from '../src/services/firebase.js';
import { sortQueue } from '../src/utils/formatters.js';

const PROJECT_ID = 'santa-fe-business-test';
const root = `artifacts/${appId}/public/data`;
const USER_ID = 'admin-business';
const service = { id: 'servico-a', nome: 'Serviço A', requerVagas: true };
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
const agendaRef = (db, agendaId) => doc(db, path('agendas', agendaId));
const book = (db, agenda, selectedPerson) => createAgendamento({ agenda, pessoa: selectedPerson, servicos: [service], userId: USER_ID, status: 'Agendado' }, db);

before(async () => {
  environment = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seedDocuments([['usuarios', USER_ID, { uid: USER_ID, role: 'admin', ativo: true }]]);
});

after(async () => environment.cleanup());

describe('transações do fluxo operacional', () => {
  test('reserva vagas até o limite e falha atomicamente com SEM_VAGA', async () => {
    const db = adminDb();
    const agenda = await seedAgenda();
    await book(db, agenda, person('1'));
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 1);
    assert.equal((await getDoc(appointmentRef(db, agenda.id, '1'))).data().status, 'Agendado');

    await book(db, agenda, person('2'));
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 2);
    await assert.rejects(book(db, agenda, person('3')), /SEM_VAGA/);
    assert.equal((await getDoc(agendaRef(db, agenda.id))).data().vagasOcupadas[service.id], 2);
    assert.equal((await getDoc(appointmentRef(db, agenda.id, '3'))).exists(), false);
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

  test('cancela, devolve vaga e cria auditoria com executor e data', async () => {
    const db = adminDb();
    const agenda = await seedAgenda();
    await book(db, agenda, person('1'));
    await cancelAgendamento({ agendaId: agenda.id, agendamentoId: `${agenda.id}_1`, userId: USER_ID }, db);

    const canceled = (await getDoc(appointmentRef(db, agenda.id, '1'))).data();
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
    await book(db, agenda, person('1'));
    const params = { agendaId: agenda.id, agendamentoId: `${agenda.id}_1`, userId: USER_ID };
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
    await book(db, agenda, person('1'));
    await concluirAgenda({ agendaId: agenda.id, userId: USER_ID }, db);
    const closed = (await getDoc(agendaRef(db, agenda.id))).data();
    assert.equal(closed.status, 'Concluída');
    assert.ok(closed.concluidaEm);
    assert.equal(closed.concluidaPor, USER_ID);
    assert.equal((await getDoc(appointmentRef(db, agenda.id, '1'))).data().status, 'Agendado');
    await assert.rejects(book(db, { ...agenda, status: 'Concluída' }, person('2')), /AGENDA_CONCLUIDA/);
    await assert.rejects(cancelAgendamento({ agendaId: agenda.id, agendamentoId: `${agenda.id}_1`, userId: USER_ID }, db), /AGENDA_CONCLUIDA/);
    await assert.rejects(setAgendamentoPrioridade({ agendaId: agenda.id, agendamentoId: `${agenda.id}_1`, prioridade: true, userId: USER_ID }, db), /AGENDA_CONCLUIDA/);
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
    await assert.rejects(book(db, restricted, person('medium', 'Médium')), /TIPO_PESSOA_NAO_PERMITIDO/);
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
    await book(db, agenda, person('1'));
    const params = { agendaId: agenda.id, agendamentoId: `${agenda.id}_1`, status: 'Presente', userId: USER_ID };
    await updateAtendimentoStatus(params, db);
    const original = (await getDoc(appointmentRef(db, agenda.id, '1'))).data().horaChegada.toMillis();
    await assert.rejects(updateAtendimentoStatus(params, db), /TRANSICAO_INVALIDA/);
    assert.equal((await getDoc(appointmentRef(db, agenda.id, '1'))).data().horaChegada.toMillis(), original);
  });

  test('registra saída uma vez e protege atendimento concluído', async () => {
    const db = adminDb();
    const agenda = await seedAgenda('agenda-saida');
    await book(db, agenda, person('1'));
    await updateAtendimentoStatus({ agendaId: agenda.id, agendamentoId: `${agenda.id}_1`, status: 'Presente', userId: USER_ID }, db);
    const params = { agendaId: agenda.id, agendamentoId: `${agenda.id}_1`, status: 'Concluído', userId: USER_ID };
    await updateAtendimentoStatus(params, db);
    const original = (await getDoc(appointmentRef(db, agenda.id, '1'))).data().horaSaida.toMillis();
    await assert.rejects(updateAtendimentoStatus(params, db), /TRANSICAO_INVALIDA/);
    assert.equal((await getDoc(appointmentRef(db, agenda.id, '1'))).data().horaSaida.toMillis(), original);
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
});
