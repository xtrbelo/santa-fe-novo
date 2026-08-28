import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import process from 'node:process';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('SEED BLOQUEADO: Firestore Emulator não está ativo.');
}

const adminUid = process.env.EMULATOR_ADMIN_UID?.trim();
if (!adminUid) {
  throw new Error('SEED BLOQUEADO: informe EMULATOR_ADMIN_UID com o UID da conta usada no login local.');
}

const projectId = process.env.GCLOUD_PROJECT || 'santa-fe-v2';
if (projectId !== 'santa-fe-v2') {
  throw new Error(`SEED BLOQUEADO: projeto inesperado (${projectId}).`);
}

const root = `artifacts/${projectId}/public/data`;
const environment = await initializeTestEnvironment({ projectId });
const now = Timestamp.now();
const futureDate = days => Timestamp.fromDate(new Date(Date.now() + days * 86400000));
const commonAgenda = {
  tipoTrabalhoId: 'trabalho-atendimento',
  tipoTrabalhoNome: 'Atendimento',
  tipo: 'Atendimento',
  horario: '19:00',
  publicosPermitidos: ['consulente', 'membro'],
  servicosIds: ['atendimento-espiritual', 'passe', 'jogo-videncia'],
  servicosNomes: {
    'atendimento-espiritual': 'Atendimento Espiritual',
    passe: 'Passe',
    'jogo-videncia': 'Jogo de Vidência'
  },
  servicosStatus: {
    'atendimento-espiritual': 'Ativo',
    passe: 'Ativo',
    'jogo-videncia': 'Ativo'
  },
  vagasTotais: { 'jogo-videncia': 5 },
  vagasOcupadas: { 'jogo-videncia': 0 },
  status: 'Aberta',
  criadoEm: now,
  criadoPor: adminUid,
  atualizadoEm: now,
  atualizadoPor: adminUid
};

try {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const write = (collectionName, id, data) => setDoc(doc(db, `${root}/${collectionName}/${id}`), data);
    await Promise.all([
      write('usuarios', adminUid, { uid: adminUid, nome: 'Administrador Local', email: 'admin@local.invalid', role: 'admin', ativo: true, criadoEm: now, atualizadoEm: now }),
      write('usuarios', 'gestor-local-teste', { uid: 'gestor-local-teste', nome: 'Gestor Local', email: 'gestor@local.invalid', role: 'gestor', ativo: true, criadoEm: now, atualizadoEm: now }),
      write('config_eventos', 'trabalho-atendimento', { nome: 'Atendimento', publicosPermitidos: ['consulente', 'membro'], ativo: true, criadoEm: now, criadoPor: adminUid, atualizadoEm: now, atualizadoPor: adminUid }),
      write('config_servicos', 'atendimento-espiritual', { nome: 'Atendimento Espiritual', tipoTrabalhoIds: ['trabalho-atendimento'], controlaVagas: false, requerVagas: false, ativo: true }),
      write('config_servicos', 'passe', { nome: 'Passe', tipoTrabalhoIds: ['trabalho-atendimento'], controlaVagas: false, requerVagas: false, ativo: true }),
      write('config_servicos', 'jogo-videncia', { nome: 'Jogo de Vidência', tipoTrabalhoIds: ['trabalho-atendimento'], controlaVagas: true, requerVagas: true, ativo: true }),
      write('pessoas', 'consulente-teste', { nome: 'Consulente Teste', vinculo: 'consulente', funcoesCasa: [], tipoPessoa: 'Consulente', ativo: true }),
      write('pessoas', 'membro-teste', { nome: 'Membro Teste', vinculo: 'membro', funcoesCasa: ['medium'], tipoPessoa: 'Médium', ativo: true }),
      write('agendas', 'agenda-a-vazia', { ...commonAgenda, data: futureDate(1) }),
      write('agendas', 'agenda-b-com-historico', { ...commonAgenda, data: futureDate(2), vagasOcupadas: { 'jogo-videncia': 1 } }),
      write('agendas', 'agenda-c-cancelamento', { ...commonAgenda, data: futureDate(3) }),
      write('agendas', 'agenda-d-gestor', { ...commonAgenda, data: futureDate(4) }),
      write('consulentes', 'agenda-b-consulente-teste', { agendaId: 'agenda-b-com-historico', pessoaBaseId: 'consulente-teste', pessoaNome: 'Consulente Teste', servicosIds: ['jogo-videncia'], servicosNomes: ['Jogo de Vidência'], status: 'Agendado', prioridade: false, criadoEm: now, criadoPor: adminUid })
    ]);
  });
  console.log('Seed local concluído: agendas A (vazia), B (com histórico), C (aberta) e D (gestor) criadas no Emulator.');
} finally {
  await environment.cleanup();
}
