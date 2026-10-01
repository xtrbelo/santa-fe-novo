import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectMemberBirthdays, selectMemberCalendar } from '../functions/memberArea.js';
import { selectPublishedMemberNotices, validateMemberNotice } from '../functions/memberNotices.js';
import { selectMemberAlbums, selectRecoverableMemberAlbums, validateMemberAlbum } from '../functions/memberAlbums.js';
import { MEMBER_MEDIA_IMAGE_LIMIT, MEMBER_MEDIA_INBOX_LIMIT, MEMBER_MEDIA_VIDEO_LIMIT, buildInstitutionalMediaName, buildMediaStorageReport, getArchivedMediaRecovery, selectMemberMedia, validateMemberInboxUpload, validateMemberMediaUpload } from '../functions/memberMedia.js';
import { findUnauthorizedParticipants, selectImageAuthorizations } from '../functions/imageAuthorization.js';
import { IMAGE_CONSENT_VERSION, buildImageConsentEvidenceHash } from '../functions/imageConsentInvitation.js';
import { selectDriveInboxFiles, validateDriveImport } from '../functions/googleDriveInbox.js';

test('perfil Membro não é tratado como acesso interno nas funções', () => {
  const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  assert.match(source, /accessRoles = new Set\(\['admin', 'gestor', 'atendimento', 'membro', 'midia'\]\)/);
  assert.match(source, /internalRoles = new Set\(\['admin', 'gestor', 'atendimento'\]\)/);
  assert.match(source, /internalRoles\.has\(executor\.data\(\)\.role\)/);
  assert.doesNotMatch(source, /internalRoles = new Set\([^\n]*membro/);
});

test('Equipe de Mídia não recebe acesso interno', () => {
  const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  assert.match(source, /memberAreaRoles = new Set\(\['admin', 'gestor', 'atendimento', 'membro', 'midia'\]\)/);
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

test('álbuns retirados podem ser recuperados por 30 dias e voltam para preparação', () => {
  const timestamp = value => ({ toDate: () => new Date(value) });
  const albums = [
    { id: 'recente', titulo: 'Retirado recente', dataAtividade: '2026-09-20', status: 'arquivado', arquivadoEm: timestamp('2026-09-20T12:00:00Z') },
    { id: 'legado', titulo: 'Retirado antes da melhoria', dataAtividade: '2026-09-10', status: 'arquivado', atualizadoEm: timestamp('2026-09-15T12:00:00Z') },
    { id: 'expirado', titulo: 'Retirado antigo', dataAtividade: '2026-08-01', status: 'arquivado', arquivadoEm: timestamp('2026-08-01T12:00:00Z') },
  ];
  const recoverable = selectRecoverableMemberAlbums(albums, { now: new Date('2026-09-30T12:00:00Z') });
  assert.deepEqual(recoverable.map(item => item.id), ['recente', 'legado']);
  assert.equal(recoverable[0].recuperarAte, '2026-10-20T12:00:00.000Z');

  const ui = readFileSync(new URL('../src/modules/MemberArea/MemberAreaModule.jsx', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  for (const expected of ['Álbuns retirados', 'Recuperável até', 'Restaurar álbum']) assert.match(ui, new RegExp(expected));
  assert.match(server, /PRAZO_RECUPERACAO_EXPIRADO/);
  assert.match(server, /ALBUM_MEMBRO_RESTAURADO/);
  assert.match(server, /status: 'rascunho'/);
});

test('metadados do álbum exigem título, data válida, status conhecido e revisão para publicar', () => {
  assert.deepEqual(validateMemberAlbum({ titulo: ' Festa ', atividade: 'Confraternização', categoria: 'eventos-campanhas', subdivisao: '', descricao: 'Registro autorizado', dataAtividade: '2026-09-29', status: 'publicado', participantesIds: ['m1', 'm1'], revisaoAutorizacoesConfirmada: true }), { titulo: 'Festa', atividade: 'Confraternização', categoria: 'eventos-campanhas', subdivisao: '', descricao: 'Registro autorizado', dataAtividade: '2026-09-29', status: 'publicado', participantesIds: ['m1'], revisaoAutorizacoesConfirmada: true });
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

test('gestão de álbuns e arquivos usa funções protegidas', () => {
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

test('mídia do álbum aceita formatos seguros e respeita limites por tipo', () => {
  const image = validateMemberMediaUpload({ albumId: 'album-1', fileName: 'foto.jpg', contentType: 'image/jpeg', size: MEMBER_MEDIA_IMAGE_LIMIT });
  const video = validateMemberMediaUpload({ albumId: 'album-1', fileName: 'video.mp4', contentType: 'video/mp4', size: MEMBER_MEDIA_VIDEO_LIMIT });
  assert.match(image.objectKey, /^member-albums\/album-1\/.+\.jpg$/);
  assert.match(video.objectKey, /^member-albums\/album-1\/.+\.mp4$/);
  assert.throws(() => validateMemberMediaUpload({ albumId: 'album-1', fileName: 'grande.jpg', contentType: 'image/jpeg', size: MEMBER_MEDIA_IMAGE_LIMIT + 1 }), /IMAGEM_MUITO_GRANDE/);
  assert.throws(() => validateMemberMediaUpload({ albumId: 'album-1', fileName: 'arquivo.exe', contentType: 'application/octet-stream', size: 10 }), /TIPO_ARQUIVO_INVALIDO/);
});

test('somente arquivos confirmados são entregues na Área do Membro', () => {
  const files = [
    { id: 'ok', nome: 'foto.jpg', tipo: 'image/jpeg', tamanho: 100, status: 'disponivel' },
    { id: 'pending', nome: 'video.mp4', tipo: 'video/mp4', tamanho: 200, status: 'aguardando_envio' },
  ];
  assert.deepEqual(selectMemberMedia(files), [{ id: 'ok', nome: 'foto.jpg', nomeOriginal: '', legenda: '', descricaoAlternativa: '', tipo: 'image/jpeg', tamanho: 100 }]);
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  assert.match(server, /secrets: r2Secrets/);
  assert.match(server, /expiresIn: 300/);
  assert.match(server, /expiresIn: 600/);
  assert.match(server, /requestChecksumCalculation: 'WHEN_REQUIRED'/);
  assert.match(server, /const command = new PutObjectCommand\(\{ Bucket: bucket, Key: upload\.objectKey, ContentType: upload\.contentType \}\)/);
});

test('galeria abre o álbum, permite escolher capa e mantém ações no servidor', () => {
  const albums = selectMemberAlbums([{ id: 'a1', titulo: 'Galeria', dataAtividade: '2026-09-30', status: 'publicado', capaArquivoId: 'foto-1' }]);
  assert.equal(albums[0].capaArquivoId, 'foto-1');
  const ui = readFileSync(new URL('../src/modules/MemberArea/MemberAlbumModal.jsx', import.meta.url), 'utf8');
  const moduleSource = readFileSync(new URL('../src/modules/MemberArea/MemberAreaModule.jsx', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  for (const expected of ['Adicionar fotos ou vídeos', 'Usar como capa', 'Editar informações', 'Publicar álbum', 'Remover']) assert.match(ui, new RegExp(expected));
  assert.match(moduleSource, /Abrir álbum/);
  for (const action of ['list-view', 'set-cover', 'delete', 'reorder']) assert.match(server, new RegExp(`'${action}'`));
  assert.match(server, /ALBUM_MEMBRO_CAPA_ALTERADA/);
  assert.match(server, /ALBUM_MEMBRO_ARQUIVO_REMOVIDO/);
});

test('Central de Mídia organiza álbuns por etapa, categoria, subdivisão e filtros', () => {
  const ui = readFileSync(new URL('../src/modules/MemberArea/MemberAreaModule.jsx', import.meta.url), 'utf8');
  const central = readFileSync(new URL('../src/modules/MemberArea/CentralMediaModule.jsx', import.meta.url), 'utf8');
  const inbox = readFileSync(new URL('../src/modules/MemberArea/DriveMediaInbox.jsx', import.meta.url), 'utf8');
  const categories = readFileSync(new URL('../src/modules/MemberArea/memberAlbumCategories.js', import.meta.url), 'utf8');
  for (const expected of ['Central de Mídia', 'Em preparação', 'Com arquivos para revisar', 'Filtrar por categoria', 'Filtrar por ano']) assert.match(ui, new RegExp(expected));
  assert.match(central, /mode="media"/);
  assert.match(ui, /!isMediaCenter && item\.status !== 'publicado'/);
  assert.match(ui, /ConfirmDialog/);
  assert.doesNotMatch(ui, /window\.confirm/);
  assert.doesNotMatch(readFileSync(new URL('../src/modules/MemberArea/DirectMediaInbox.jsx', import.meta.url), 'utf8'), /window\.confirm/);
  assert.match(inbox, /Importar do Google Drive/);
  for (const expected of ['Trabalhos da Casa', 'Celebrações e Festividades', 'Sacramentos', 'Ações Sociais', 'Eventos e Campanhas', 'Institucional', 'Redes Sociais', 'Vídeos', 'Arquivo Histórico']) assert.match(categories, new RegExp(expected));
});

test('entrada do Google Drive filtra formatos seguros e prepara importação para o R2', () => {
  const files = selectDriveInboxFiles([
    { id: 'foto-1', name: 'foto.jpg', mimeType: 'image/jpeg', size: '100', createdTime: '2026-09-30T12:00:00Z' },
    { id: 'doc-1', name: 'texto.pdf', mimeType: 'application/pdf', size: '200' },
  ]);
  assert.deepEqual(files.map(item => item.id), ['foto-1']);
  assert.equal(validateDriveImport({ albumId: 'album-1', files })[0].contentType, 'image/jpeg');
  const ui = readFileSync(new URL('../src/modules/MemberArea/DriveMediaInbox.jsx', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  for (const expected of ['00 - ENTRADA', 'Importar selecionados', 'O original permanece no Drive', 'Já importado']) assert.match(ui, new RegExp(expected));
  assert.match(server, /manageDriveMediaInbox/);
  assert.match(server, /GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON/);
  assert.match(server, /ALBUM_MEMBRO_ARQUIVO_IMPORTADO_DRIVE/);
});

test('entrada direta recebe múltiplas mídias do celular com progresso e confirmação privada', () => {
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const helper = readFileSync(new URL('../functions/memberMedia.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/modules/MemberArea/DirectMediaInbox.jsx', import.meta.url), 'utf8');
  assert.match(server, /create-inbox-upload/);
  assert.match(server, /confirm-inbox-upload/);
  assert.match(server, /list-inbox/);
  assert.match(server, /media-inbox\/\$\{request\.auth\.uid\}/);
  assert.match(helper, /validateMemberInboxUpload/);
  assert.match(ui, /Entrada direta pelo celular/);
  assert.match(ui, /XMLHttpRequest/);
  assert.match(ui, /multiple/);
  assert.match(ui, /Até \{MAX_FILES\} por envio/);
  assert.match(ui, /next\.length > MAX_FILES/);
  assert.match(ui, /Nenhum arquivo foi adicionado/);
  assert.doesNotMatch(ui, /\.slice\(0, MAX_FILES\)/);
  assert.match(ui, /Cancelar seleção/);
  assert.match(ui, /Enviar arquivos/);
  assert.match(ui, /Arquivos na entrada/);
  assert.equal(validateMemberInboxUpload({ fileName: 'foto.jpg', contentType: 'image/jpeg', size: 1024 }).extension, 'jpg');
  assert.throws(() => validateMemberInboxUpload({ fileName: 'arquivo.pdf', contentType: 'application/pdf', size: 1024 }), /TIPO_ARQUIVO_INVALIDO/);
  assert.throws(() => validateMemberInboxUpload({ fileName: 'video.mp4', contentType: 'video/mp4', size: MEMBER_MEDIA_VIDEO_LIMIT + 1 }), /VIDEO_MUITO_GRANDE/);
  assert.equal(MEMBER_MEDIA_INBOX_LIMIT, 200);
});

test('triagem da entrada move arquivos sem duplicar o objeto e oferece ações em lote', () => {
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/modules/MemberArea/DirectMediaInbox.jsx', import.meta.url), 'utf8');
  for (const action of ['move-inbox', 'archive-inbox', 'delete-inbox']) assert.match(server, new RegExp(action));
  assert.match(server, /objectKey: data\.objectKey/);
  assert.match(server, /targetAlbum\.data\(\)\?\.status === 'publicado'.*albumUpdate\.status = 'rascunho'/);
  assert.match(server, /MIDIA_ENTRADA_MOVIDA_ALBUM/);
  assert.match(server, /MIDIA_ENTRADA_ARQUIVADA/);
  assert.match(server, /MIDIA_ENTRADA_REMOVIDA/);
  assert.match(ui, /Selecionar resultados/);
  assert.match(ui, /Mover para álbum/);
  assert.match(ui, /Criar álbum/);
  assert.match(ui, /Arquivar/);
  assert.match(ui, /Excluir/);
});

test('álbum permite ordenar fotos e vídeos com validação integral no servidor', () => {
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const helper = readFileSync(new URL('../functions/memberMedia.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/modules/MemberArea/MemberAlbumModal.jsx', import.meta.url), 'utf8');
  assert.match(server, /action === 'reorder'/);
  assert.match(server, /ORDEM_ARQUIVOS_INVALIDA/);
  assert.match(server, /ALBUM_MEMBRO_ARQUIVOS_ORDENADOS/);
  assert.match(helper, /\.sort\(\(a, b\) => a\.ordem - b\.ordem/);
  assert.match(ui, /Use as setas em cada miniatura/);
  assert.match(ui, /Mover \$\{file\.nome\} para trás/);
  assert.match(ui, /Mover \$\{file\.nome\} para frente/);
});

test('revisão de publicação bloqueia álbum vazio, mostra prévia e registra transições', () => {
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/modules/MemberArea/MemberAlbumModal.jsx', import.meta.url), 'utf8');
  assert.match(server, /ALBUM_SEM_ARQUIVOS/);
  assert.match(server, /ALBUM_MEMBRO_PUBLICADO/);
  assert.match(server, /ALBUM_MEMBRO_RETIRADO_PUBLICACAO/);
  assert.match(server, /publicadoEm = now/);
  assert.match(server, /retiradoPublicacaoEm = now/);
  assert.match(ui, /Prévia do membro/);
  assert.match(ui, /Revisão antes de publicar/);
  assert.match(ui, /Autorizações sem bloqueios/);
  assert.match(ui, /Publicação bloqueada/);
});

test('arquivo institucional permite buscar, arquivar, restaurar e excluir com auditoria', () => {
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/modules/MemberArea/DirectMediaInbox.jsx', import.meta.url), 'utf8');
  assert.match(server, /restore-inbox/);
  assert.match(server, /MIDIA_ENTRADA_RESTAURADA/);
  assert.match(server, /PRAZO_RECUPERACAO_EXPIRADO/);
  assert.match(server, /status: 'disponivel', restauradoEm: now/);
  assert.match(server, /archived: await Promise\.all/);
  assert.match(ui, /Buscar arquivo pelo nome/);
  assert.match(ui, /Arquivados/);
  assert.match(ui, /Restaurar/);
  assert.match(ui, /Excluir definitivamente/);
  assert.match(ui, /Recuperação disponível por 30 dias/);
  assert.match(ui, /Prazo de recuperação encerrado/);
  assert.equal(getArchivedMediaRecovery('2026-09-15T12:00:00Z', { now: new Date('2026-09-30T12:00:00Z') }).recuperavel, true);
  assert.equal(getArchivedMediaRecovery('2026-08-15T12:00:00Z', { now: new Date('2026-09-30T12:00:00Z') }).recuperavel, false);
});

test('controle de armazenamento conta objetos únicos e sinaliza duplicidades para revisão', () => {
  const report = buildMediaStorageReport([
    { nome: 'foto-a.jpg', tamanho: 100, objectKey: 'entrada/a.jpg', etag: 'hash-a', status: 'disponivel' },
    { nome: 'foto-a-copia.jpg', tamanho: 100, objectKey: 'entrada/b.jpg', etag: 'hash-a', status: 'disponivel' },
    { nome: 'foto-movida.jpg', tamanho: 200, objectKey: 'entrada/c.jpg', etag: 'hash-c', status: 'movido' },
    { nome: 'foto-movida.jpg', tamanho: 200, objectKey: 'entrada/c.jpg', etag: 'hash-c', status: 'disponivel' },
    { nome: 'removida.jpg', tamanho: 500, objectKey: 'entrada/removida.jpg', etag: 'hash-x', status: 'removido' },
  ]);
  assert.equal(report.totalArquivos, 3);
  assert.equal(report.totalBytes, 400);
  assert.equal(report.duplicados, 1);
  assert.equal(report.economiaPossivelBytes, 100);
  assert.equal(report.duplicateByKey.get('entrada/a.jpg').duplicidade, 'confirmada');

  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/modules/MemberArea/DirectMediaInbox.jsx', import.meta.url), 'utf8');
  assert.match(server, /buildMediaStorageReport/);
  assert.match(server, /etag: String\(head\.ETag/);
  for (const expected of ['Armazenamento', 'Repetidos', 'Clique para localizar', 'Revisão de arquivos repetidos', 'Abrir álbum', 'Possível repetido']) assert.match(ui, new RegExp(expected));
  assert.match(server, /repetidos: await Promise\.all/);
  assert.match(server, /albumTitulo/);
});

test('mídias recebem nome institucional e informações acessíveis sem perder o nome original', () => {
  assert.equal(buildInstitutionalMediaName({ album: { dataAtividade: '2026-09-30', categoria: 'Trabalhos da Casa', titulo: 'Gira de Caboclo' }, originalName: 'IMG_1234.JPG', contentType: 'image/jpeg', sequence: 2 }), '2026-09-30_trabalhos-da-casa_gira-de-caboclo_002.jpg');
  const selected = selectMemberMedia([{ id: 'm1', nome: '2026-09-30_registro_album_001.jpg', nomeOriginal: 'IMG_1234.JPG', legenda: 'Abertura da gira', descricaoAlternativa: 'Membros reunidos no salão', tipo: 'image/jpeg', tamanho: 100, status: 'disponivel' }]);
  assert.equal(selected[0].nomeOriginal, 'IMG_1234.JPG');
  assert.equal(selected[0].descricaoAlternativa, 'Membros reunidos no salão');
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/modules/MemberArea/MemberAlbumModal.jsx', import.meta.url), 'utf8');
  assert.match(server, /update-details/);
  assert.match(server, /ALBUM_MEMBRO_ARQUIVO_DESCRITO/);
  assert.match(server, /nomeOriginal/);
  for (const expected of ['Legenda e acessibilidade', 'Descrição alternativa para acessibilidade', 'Nome original preservado']) assert.match(ui, new RegExp(expected));
});

test('downloads de mídia são temporários, auditados e restritos à gestão de mídia', () => {
  const server = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const moduleSource = readFileSync(new URL('../src/modules/MemberArea/MemberAreaModule.jsx', import.meta.url), 'utf8');
  const modal = readFileSync(new URL('../src/modules/MemberArea/MemberAlbumModal.jsx', import.meta.url), 'utf8');
  assert.match(server, /memberMediaRoles = new Set\(\['admin', 'gestor', 'midia'\]\)/);
  assert.match(server, /action === 'create-downloads'/);
  assert.match(server, /DOWNLOAD_MIDIA_NAO_AUTORIZADO/);
  assert.match(server, /ResponseContentDisposition/);
  assert.match(server, /expiresIn: 300/);
  assert.match(server, /ALBUM_MEMBRO_ARQUIVOS_BAIXADOS/);
  assert.match(moduleSource, /canManageAlbums = isMediaCenter && \['admin', 'gestor', 'midia'\]/);
  assert.match(moduleSource, /action: 'create-downloads'/);
  for (const expected of ['Baixar álbum (.zip)', 'Baixar selecionados', 'selecionado(s) para download']) assert.match(modal, new RegExp(expected.replace(/[().]/g, '\\$&')));
  assert.match(moduleSource, /import\('jszip'\)/);
  assert.match(moduleSource, /500 \* 1024 \* 1024/);
});
