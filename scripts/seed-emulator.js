import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import process from 'node:process';
import { withPessoaSearchIndex } from '../src/services/firebase.js';

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
      write('pessoas', 'consulente-teste', withPessoaSearchIndex({ nome: 'Consulente Teste', vinculo: 'consulente', funcoesCasa: [], tipoPessoa: 'Consulente', ativo: true })),
      write('pessoas', 'membro-teste', withPessoaSearchIndex({ nome: 'Membro Teste', vinculo: 'membro', funcoesCasa: ['medium'], tipoPessoa: 'Médium', ativo: true })),
      write('pessoas', 'joao-paulo-belo', withPessoaSearchIndex({ nome: 'João Paulo Belo', cpf: '52998224725', contato: '96991234567', vinculo: 'consulente', tipoPessoa: 'Consulente', ativo: true })),
      write('pessoas', 'marcia-araujo', withPessoaSearchIndex({ nome: 'Márcia Araújo', cpf: '11144477735', contato: '96998881234', vinculo: 'membro', funcoesCasa: ['medium'], tipoPessoa: 'Médium', ativo: true })),
      write('pessoas', 'maria-silva-a', withPessoaSearchIndex({ nome: 'Maria da Silva', cpf: '12345678909', contato: '96990007812', vinculo: 'consulente', tipoPessoa: 'Consulente', ativo: true })),
      write('pessoas', 'maria-silva-b', withPessoaSearchIndex({ nome: 'Maria da Silva', cpf: '98765432100', contato: '96990001145', vinculo: 'membro', funcoesCasa: ['cambone'], tipoPessoa: 'Cambone', ativo: true })),
      write('pessoas', 'pessoa-inativa-7a', withPessoaSearchIndex({ nome: 'Pessoa Inativa Teste', contato: '96999990000', vinculo: 'consulente', tipoPessoa: 'Consulente', ativo: false })),
      write('pessoas', 'pessoa-legada-7a', { nome: 'Pessoa Legada CPF', cpf: '39053344705', contato: '96997776655', vinculo: 'consulente', tipoPessoa: 'Consulente', ativo: true }),
      write('agendas', 'agenda-a-vazia', { ...commonAgenda, data: futureDate(1) }),
      write('agendas', 'agenda-b-com-historico', { ...commonAgenda, data: futureDate(2), vagasOcupadas: { 'jogo-videncia': 1 } }),
      write('agendas', 'agenda-c-cancelamento', { ...commonAgenda, data: futureDate(3) }),
      write('agendas', 'agenda-d-gestor', { ...commonAgenda, data: futureDate(4) }),
      write('agendas', 'fase6b-origem-aberta', { ...commonAgenda, data: futureDate(5), vagasOcupadas: { 'jogo-videncia': 1 } }),
      write('agendas', 'fase6b-origem-cancelada', { ...commonAgenda, data: futureDate(6), status: 'Cancelada', vagasOcupadas: { 'jogo-videncia': 1 } }),
      write('agendas', 'fase6b-destino-vaga', { ...commonAgenda, data: futureDate(7), vagasTotais: { 'jogo-videncia': 3 }, vagasOcupadas: { 'jogo-videncia': 0 } }),
      write('agendas', 'fase6b-destino-cheio', { ...commonAgenda, data: futureDate(8), vagasTotais: { 'jogo-videncia': 1 }, vagasOcupadas: { 'jogo-videncia': 1 } }),
      write('agendas', 'fase6b-destino-servico-cancelado', { ...commonAgenda, data: futureDate(9), servicosStatus: { ...commonAgenda.servicosStatus, 'jogo-videncia': 'Cancelado' } }),
      write('consulentes', 'agenda-b-consulente-teste', { agendaId: 'agenda-b-com-historico', pessoaBaseId: 'consulente-teste', pessoaNome: 'Consulente Teste', servicosIds: ['jogo-videncia'], servicosNomes: ['Jogo de Vidência'], status: 'Agendado', prioridade: false, criadoEm: now, criadoPor: adminUid }),
      write('consulentes', 'fase6b-atendimento-aberto', { agendaId: 'fase6b-origem-aberta', pessoaBaseId: 'consulente-teste', nome: 'Consulente Teste', servicosIds: ['atendimento-espiritual', 'jogo-videncia'], servicosNomes: ['Atendimento Espiritual', 'Jogo de Vidência'], status: 'Agendado', prioridade: false, criadoEm: now, criadoPor: adminUid }),
      write('consulentes', 'fase6b-atendimento-cancelada', { agendaId: 'fase6b-origem-cancelada', pessoaBaseId: 'membro-teste', nome: 'Membro Teste', servicosIds: ['jogo-videncia'], servicosNomes: ['Jogo de Vidência'], status: 'Agendado', prioridade: false, criadoEm: now, criadoPor: adminUid }),
      write('agendamentos_ativos', 'fase6b-origem-aberta_consulente-teste', { agendaId: 'fase6b-origem-aberta', pessoaBaseId: 'consulente-teste', agendamentoId: 'fase6b-atendimento-aberto', criadoEm: now, criadoPor: adminUid }),
      write('agendamentos_ativos', 'fase6b-origem-cancelada_membro-teste', { agendaId: 'fase6b-origem-cancelada', pessoaBaseId: 'membro-teste', agendamentoId: 'fase6b-atendimento-cancelada', criadoEm: now, criadoPor: adminUid })
    ]);
  });
  console.log('Seed local concluído, incluindo cenários seguros de realocação da Fase 6B.');
} finally {
  await environment.cleanup();
}
