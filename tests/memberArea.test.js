import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectMemberBirthdays, selectMemberCalendar } from '../functions/memberArea.js';
import { selectPublishedMemberNotices, validateMemberNotice } from '../functions/memberNotices.js';
import { selectMemberAlbums, validateMemberAlbum } from '../functions/memberAlbums.js';
import { findUnauthorizedParticipants, selectImageAuthorizations } from '../functions/imageAuthorization.js';
import { IMAGE_CONSENT_VERSION, buildImageConsentEvidenceHash } from '../functions/imageConsentInvitation.js';

test('perfil Membro não é tratado como acesso interno nas funções', () => {
  const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  assert.match(source, /accessRoles = new Set\(\['admin', 'gestor', 'atendimento', 'membro', 'midia'\]\)/);
  assert.match(source, /internalRoles = new Set\(\['admin', 'gestor', 'atendimento'\]\)/);
  assert.match(source, /internalRoles\.has\(executor\.data\(\)\.role\)/);
  assert.doesNotMatch(source, /internalRoles = new Set\([^\n]*membro/);
});

test('Equipe de Mídia não recebe acesso interno', () => {
  const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  assert.match(source, /memberAreaRoles = new Set\(\['admin', 'gestor', 'membro', 'midia'\]\)/);
  assert.match(source, /memberMediaRoles = new Set\(\['admin', 'gestor', 'midia'\]\)/);
  assert.doesNotMatch(source, /internalRoles = new Set\([^\n]*midia/);
});

test('Área do Membro carrega calendário e aniversariantes sem expor ano ou idade', () => {
  const source = readFileSync(new URL('../src/modules/MemberArea/MemberAreaModule.jsx', import.meta.url), 'utf8');
  for (const expected of ['Próximas atividades', 'Aniversariantes', 'Mural de avisos', 'Fotos e vídeos', 'Acesso protegido']) {
    assert.match(source, new RegExp(expected));
  }
  assert.doesNotMatch(source, /ano de nascimento.*item\./);
});

test('aniversariantes incluem somente membros ativos e não ocultos do mês', () => {
  const people = [
    { id: '1', nome: 'Ana', vinculo: 'membro', ativo: true, dataNascimento: '1990-09-15' },
    { id: '2', nome: 'Bia', vinculo: 'membro', ativo: true, dataNascimento: '1985-09-29', ocultarAniversario: true },
    { id: '3', nome: 'Caio', vinculo: 'membro', ativo: false, dataNascimento: '1991-09-10' },
    { id: '4', nome: 'Davi', vinculo: 'consulente', ativo: true, dataNascimento: '1992-09-11' },
    { id: '5', nome: 'Eva', vinculo: 'membro', ativo: true, dataNascimento: '1993-10-01' },
  ];
  assert.deepEqual(selectMemberBirthdays(people, { month: 9, now: new Date('2026-09-15T12:00:00-03:00') }), [
    { id: '1', nome: 'Ana', dia: 15, mes: 9, hoje: true },
  ]);
});

test('calendário entrega somente programação futura permitida para membros', () => {
  const timestamp = value => ({ toDate: () => new Date(value) });
  const agendas = [
    { id: '1', tipo: 'Atendimento', data: timestamp('2026-09-30T22:00:00Z'), horario: '19:00', ativo: true, status: 'Agendada', publicosPermitidos: ['membro'], servicosNomes: { passe: 'Passe' } },
    { id: '2', tipo: 'Interno', data: timestamp('2026-10-01T22:00:00Z'), ativo: true, status: 'Agendada', publicosPermitidos: ['consulente'] },
    { id: '3', tipo: 'Cancelado', data: timestamp('2026-10-02T22:00:00Z'), ativo: true, status: 'Cancelada', publicosPermitidos: ['membro'] },
  ];
  assert.deepEqual(selectMemberCalendar(agendas, { now: new Date('2026-09-29T12:00:00-03:00') }), [{ id: '1', titulo: 'Atendimento', data: '2026-09-30T22:00:00.000Z', horario: '19:00', servicos: ['Passe'] }]);
});

test('mural entrega somente avisos publicados e vigentes, com destaques primeiro', () => {
  const timestamp = value => ({ toDate: () => new Date(value) });
  const notices = [
    { id: 'normal', titulo: 'Normal', mensagem: 'Mensagem', status: 'publicado', inicioEm: timestamp('2026-09-01T03:00:00Z') },
    { id: 'fixo', titulo: 'Importante', mensagem: 'Destaque', status: 'publicado', destaque: true, inicioEm: timestamp('2026-09-10T03:00:00Z'), fimEm: timestamp('2026-10-01T02:59:59Z') },
    { id: 'futuro', titulo: 'Futuro', mensagem: 'Depois', status: 'publicado', inicioEm: timestamp('2026-10-02T03:00:00Z') },
    { id: 'retirado', titulo: 'Retirado', mensagem: 'Não mostrar', status: 'arquivado', inicioEm: timestamp('2026-09-01T03:00:00Z') },
  ];
  assert.deepEqual(selectPublishedMemberNotices(notices, { now: new Date('2026-09-29T12:00:00-03:00') }).map(item => item.id), ['fixo', 'normal']);
});

test('aviso exige conteúdo e período válido dentro dos limites', () => {
  assert.deepEqual(validateMemberNotice({ titulo: ' Aviso ', mensagem: ' Texto ', inicioEm: '2026-09-29T03:00:00Z', fimEm: '2026-09-30T02:59:59Z', destaque: true }).titulo, 'Aviso');
  assert.throws(() => validateMemberNotice({ titulo: '', mensagem: 'Texto', inicioEm: new Date() }), /TITULO_INVALIDO/);
  assert.throws(() => validateMemberNotice({ titulo: 'Aviso', mensagem: 'Texto', inicioEm: '2026-10-02T03:00:00Z', fimEm: '2026-10-01T03:00:00Z' }), /FIM_INVALIDO/);
});

test('gestão do mural ocorre somente pela função protegida', () => {
  const ui = readFileSync(new URL('../src/modules/MemberArea/MemberAreaModule.jsx', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  assert.match(ui, /manageMemberNoticeOnServer/);
  assert.match(server, /GESTAO_AREA_MEMBRO_OBRIGATORIA/);
  assert.match(server, /AVISO_MEMBRO_PUBLICADO/);
});

test('álbuns publicados são visíveis e rascunhos ficam restritos à gestão', () => {
  const albums = [
    { id: 'a', titulo: 'Publicado', dataAtividade: '2026-09-20', status: 'publicado', quantidadeArquivos: 4 },
    { id: 'b', titulo: 'Rascunho', dataAtividade: '2026-09-21', status: 'rascunho' },
    { id: 'c', titulo: 'Retirado', dataAtividade: '2026-09-22', status: 'arquivado' },
  ];
  assert.deepEqual(selectMemberAlbums(albums).map(item => item.id), ['a']);
  assert.deepEqual(selectMemberAlbums(albums, { includeDrafts: true }).map(item => item.id), ['b', 'a']);
});

test('metadados do álbum exigem título, data válida, status conhecido e revisão para publicar', () => {
  assert.deepEqual(validateMemberAlbum({ titulo: ' Festa ', atividade: 'Confraternização', descricao: 'Registro autorizado', dataAtividade: '2026-09-29', status: 'publicado', participantesIds: ['m1', 'm1'], revisaoAutorizacoesConfirmada: true }), { titulo: 'Festa', atividade: 'Confraternização', descricao: 'Registro autorizado', dataAtividade: '2026-09-29', status: 'publicado', participantesIds: ['m1'], revisaoAutorizacoesConfirmada: true });
  assert.throws(() => validateMemberAlbum({ titulo: '', dataAtividade: '2026-09-29' }), /TITULO_INVALIDO/);
  assert.throws(() => validateMemberAlbum({ titulo: 'Álbum', dataAtividade: '2026-02-30' }), /DATA_ATIVIDADE_INVALIDA/);
  assert.throws(() => validateMemberAlbum({ titulo: 'Álbum', dataAtividade: '2026-09-29', status: 'privado' }), /STATUS_INVALIDO/);
  assert.throws(() => validateMemberAlbum({ titulo: 'Álbum', dataAtividade: '2026-09-29', status: 'publicado' }), /REVISAO_AUTORIZACOES_OBRIGATORIA/);
});

test('autorizações de imagem assumem pendente e destacam participantes bloqueados', () => {
  const people = [
    { id: '1', nome: 'Ana', vinculo: 'membro', ativo: true },
    { id: '2', nome: 'Bia', tipoPessoa: 'Membro', ativo: true },
    { id: '3', nome: 'Caio', vinculo: 'consulente', ativo: true },
    { id: '4', nome: 'Davi', vinculo: 'membro', ativo: false },
  ];
  const items = selectImageAuthorizations(people, [{ id: '1', status: 'autorizado', origem: 'titular_email', observacao: 'Confirmado por e-mail' }]);
  assert.deepEqual(items.map(item => [item.nome, item.status]), [['Ana', 'autorizado'], ['Bia', 'pendente']]);
  assert.deepEqual(findUnauthorizedParticipants(['1', '2'], items).map(item => item.nome), ['Bia']);
});

test('aceite do cadastro autoriza imagem e a decisão digital posterior do titular prevalece', () => {
  const people = [{ id: '1', nome: 'Ana', vinculo: 'membro', ativo: true, consentimentoImagem: { autorizado: true, versao: '2026-09-29.1', registradoEm: new Date('2026-09-29T12:00:00Z') } }];
  const fromRegistration = selectImageAuthorizations(people);
  assert.equal(fromRegistration[0].status, 'autorizado');
  assert.equal(fromRegistration[0].origem, 'cadastro');
  assert.equal(selectImageAuthorizations(people, [{ id: '1', status: 'nao_autorizado', origem: 'titular_sistema' }])[0].status, 'nao_autorizado');
  assert.equal(selectImageAuthorizations([{ id: '2', nome: 'Bia', vinculo: 'membro', ativo: true }], [{ id: '2', status: 'autorizado', origem: 'titular_presencial' }])[0].status, 'pendente');
  assert.equal(selectImageAuthorizations([{ id: '2', nome: 'Bia', vinculo: 'membro', ativo: true }], [{ id: '2', status: 'autorizado' }])[0].status, 'pendente');
});

test('decisão autenticada do membro gera evidência verificável', () => {
  const hash = buildImageConsentEvidenceHash({ pessoaId: 'p1', solicitacaoId: 'p1', autorizado: true, versaoTermo: IMAGE_CONSENT_VERSION, respondidoEm: '2026-09-29T20:00:00.000Z', canal: 'conta_autenticada', titularUid: 'membro1' });
  assert.equal(hash.length, 64);
});

test('autorização pendente fica no cadastro sem permitir decisão administrativa', () => {
  const details = readFileSync(new URL('../src/components/pessoas/PessoaDetalhesModal.jsx', import.meta.url), 'utf8');
  const consent = readFileSync(new URL('../src/components/pessoas/ImageConsentStatus.jsx', import.meta.url), 'utf8');
  const myRegistration = readFileSync(new URL('../src/modules/MeuCadastro/MeuCadastroModule.jsx', import.meta.url), 'utf8');
  const memberArea = readFileSync(new URL('../src/modules/MemberArea/MemberAreaModule.jsx', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../src/services/firebaseFunctions.js', import.meta.url), 'utf8');
  assert.match(details, /ImageConsentStatus/);
  assert.match(consent, /própria conta/);
  assert.doesNotMatch(consent, /Abrir termo para o membro|Confirmar decisão/);
  assert.match(myRegistration, /Somente você, autenticado na sua conta/);
  assert.match(myRegistration, /setMyImageConsentOnServer/);
  assert.doesNotMatch(memberArea, /ImageAuthorizationPanel/);
  assert.doesNotMatch(client, /sendImageConsentInvitationsOnServer/);
  assert.doesNotMatch(client, /createInPersonImageConsentSessionOnServer|submitInPersonImageConsentDecisionOnServer/);
});

test('gestão de álbuns usa função protegida e não grava arquivos nesta etapa', () => {
  const ui = readFileSync(new URL('../src/modules/MemberArea/MemberAreaModule.jsx', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  assert.match(ui, /manageMemberAlbumOnServer/);
  assert.match(server, /GESTAO_MIDIA_OBRIGATORIA/);
  assert.match(server, /ALBUM_MEMBRO_CRIADO/);
  assert.match(server, /AUTORIZACAO_IMAGEM_PENDENTE/);
  assert.match(server, /manageImageAuthorization/);
  assert.match(server, /AUTORIZACAO_SOMENTE_DIGITAL/);
  assert.match(server, /setMyImageConsent/);
  assert.match(server, /AUTORIZACAO_EXCLUSIVA_CONTA_MEMBRO/);
  assert.match(server, /consentimentoImagem\?\.origem !== 'titular_presencial' && person\.data\(\)\?\.consentimentoImagem\?\.autorizado === true/);
  assert.match(server, /FLUXO_EMAIL_AUTORIZACAO_DESATIVADO/);
  assert.doesNotMatch(server, /albuns_membros.*getStorage/);
});
