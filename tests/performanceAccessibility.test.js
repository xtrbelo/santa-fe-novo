import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSource = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('carrega módulos de tela sob demanda com fallback visível', () => {
  const source = readSource('../src/App.jsx');
  assert.match(source, /lazyNamed\(\(\) => import\('/);
  assert.match(source, /<Suspense fallback={<ModuleLoading \/>}>/);
  assert.match(source, /from '\.\/services\/firebaseAuth'/);
  assert.match(source, /import\('\.\/services\/firebaseCore'\)/);
});

test('painel acompanha somente usuários pendentes', () => {
  const source = readSource('../src/modules/Home/HomeModule.jsx');
  assert.match(source, /where\('role', '==', ROLES\.PENDENTE\)/);
  assert.match(source, /getCountFromServer/);
  assert.match(source, /total\.data\(\)\.count - inactive\.data\(\)\.count/);
  assert.match(source, /setInterval\(refreshPendingCount, 60000\)/);
  assert.doesNotMatch(source, /onSnapshot\(getAppCollection\('usuarios'\)/);
});

test('Fluxo do Dia consulta apenas agendas da data corrente', () => {
  const source = readSource('../src/modules/Fluxo/FluxoModule.jsx');
  assert.match(source, /where\('data', '>=', Timestamp\.fromDate\(startOfToday\)\)/);
  assert.match(source, /where\('data', '<', Timestamp\.fromDate\(startOfTomorrow\)\)/);
  assert.doesNotMatch(source, /onSnapshot\(getAppCollection\('agendas'\)/);
});

test('Fluxo do Dia permite correção auditada de status conforme a permissão', () => {
  const source = readSource('../src/modules/Fluxo/AtendimentoDiaCard.jsx');
  assert.match(source, /ATTENDANCE_STATUS_CORRECT/);
  assert.match(source, /corrigirStatusAtendimento/);
  assert.match(source, /Informe o motivo da correção/);
});

test('auditoria fica centralizada e restrita ao perfil autorizado', () => {
  const permissions = readSource('../src/constants/permissions.js');
  const app = readSource('../src/App.jsx');
  const sidebar = readSource('../src/components/layout/Sidebar.jsx');
  const audit = readSource('../src/modules/Auditoria/AuditoriaModule.jsx');
  assert.match(permissions, /AUDIT: 'auditoria'/);
  assert.match(permissions, /\[MODULES\.AUDIT\]: PERMISSIONS\.AUDIT_VIEW/);
  assert.match(app, /AuditoriaModule/);
  assert.match(sidebar, /label: 'Auditoria'/);
  assert.match(audit, /Histórico centralizado das alterações do sistema/);
});

test('Programação mantém datas atuais e pagina somente o histórico antigo', () => {
  const source = readSource('../src/modules/Programacao/ProgramacaoModule.jsx');
  assert.match(source, /where\('data', '>=', today\)/);
  assert.match(source, /where\('data', '<', today\).*limit\(historyPageSize\)/s);
  assert.match(source, /startAfter\(historyCursor\)/);
  assert.match(source, /Carregar histórico mais antigo/);
});

test('modal e notificações expõem semântica acessível', () => {
  const modalSource = readSource('../src/components/ui/Modal.jsx');
  const toastSource = readSource('../src/components/ui/Toast.jsx');
  const cardSource = readSource('../src/components/ui/Card.jsx');
  const buttonSource = readSource('../src/components/ui/Button.jsx');
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.match(modalSource, /aria-label="Fechar janela"/);
  assert.match(toastSource, /aria-live="polite"/);
  assert.match(toastSource, /aria-label="Fechar notificação"/);
  assert.match(cardSource, /role={onClick \? 'button'/);
  assert.match(cardSource, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(buttonSource, /focus-visible:ring-2/);
});

test('confirmações aguardam operações assíncronas e bloqueiam envio duplicado', () => {
  const source = readSource('../src/components/ui/ConfirmDialog.jsx');
  assert.match(source, /await onConfirm\(\)/);
  assert.match(source, /disabled={busy}/);
  assert.doesNotMatch(source, /onConfirm\(\);\s*onClose\(\)/);
});

test('versão do ambiente permanece visível no rodapé e na navegação', () => {
  const versionSource = readSource('../src/constants/appVersion.js');
  const footerSource = readSource('../src/components/layout/AppFooter.jsx');
  const appSource = readSource('../src/App.jsx');
  const sidebarSource = readSource('../src/components/layout/Sidebar.jsx');
  assert.match(versionSource, /APP_VERSION = '25Y'/);
  assert.match(footerSource, /fixed inset-x-0 bottom-0/);
  assert.match(appSource, /APP_VERSION_LABEL/);
  assert.match(sidebarSource, /APP_VERSION_LABEL/);
});

test('hosting não mantém uma versão antiga da aplicação em cache', () => {
  const firebaseConfig = readFileSync(new URL('../firebase.json', import.meta.url), 'utf8');
  assert.match(firebaseConfig, /no-cache, no-store, must-revalidate/);
});

test('Agendamentos distingue carregamento, falha e lista vazia', () => {
  const source = readSource('../src/modules/Agendas/AgendasModule.jsx');
  assert.match(source, /Carregando agendamentos/);
  assert.match(source, /Não foi possível carregar os agendamentos/);
  assert.match(source, /setReloadVersion\(value => value \+ 1\)/);
  assert.match(source, /!loadingData && !loadError/);
});

test('Agendamentos carrega dados operacionais por agenda e históricos sob demanda', () => {
  const source = readSource('../src/modules/Agendas/AgendasModule.jsx');
  assert.match(source, /where\('data', '>=', today\)/);
  assert.match(source, /where\('agendaId', 'in', ids\)/);
  assert.match(source, /appointmentScope = null/);
  assert.match(source, /historicalFilters\.has\(filter\)/);
  assert.match(source, /where\('status', '==', 'Cancelado'\)/);
  assert.match(source, /where\('status', 'in', \['Concluído', 'Faltou'\]\)/);
});

test('telas administrativas informam carregamento, erro e nova tentativa', () => {
  const stateSource = readSource('../src/components/ui/DataLoadState.jsx');
  assert.match(stateSource, /role="status"/);
  assert.match(stateSource, /role="alert"/);
  assert.match(stateSource, /Tentar novamente/);
  [
    '../src/modules/Programacao/ProgramacaoModule.jsx',
    '../src/modules/Pessoas/PessoasModule.jsx',
    '../src/modules/Usuarios/UsuariosModule.jsx',
    '../src/modules/Convites/ConvitesModule.jsx',
    '../src/modules/Autocadastros/AutocadastrosModule.jsx',
  ].forEach(path => {
    const source = readSource(path);
    assert.match(source, /<DataLoadState/);
    assert.match(source, /setReloadVersion\(value => value \+ 1\)/);
  });
});

test('Configurações e Meu Cadastro distinguem falha técnica de ausência de dados', () => {
  const configSource = readSource('../src/modules/Configuracoes/ConfiguracoesModule.jsx');
  const registrationSource = readSource('../src/modules/MeuCadastro/MeuCadastroModule.jsx');
  assert.match(configSource, /<DataLoadState[^>]+subject="as configurações"/);
  assert.match(configSource, /setReloadVersion\(value => value \+ 1\)/);
  assert.match(registrationSource, /setLoadError\(true\)/);
  assert.match(registrationSource, /<DataLoadState[^>]+subject="seu cadastro"/);
});

test('manutenção de vagas exige verificação antes da correção explícita', () => {
  const source = readSource('../src/modules/Configuracoes/ConfiguracoesModule.jsx');
  assert.match(source, /Verificar contadores de vagas/);
  assert.match(source, /Corrigir divergências/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /reconcileAgendaVacancies/);
});

test('Pessoas e Usuários expõem o histórico de registros inativos', () => {
  const peopleSource = readSource('../src/modules/Pessoas/PessoasModule.jsx');
  const usersSource = readSource('../src/modules/Usuarios/UsuariosModule.jsx');
  const userCardSource = readSource('../src/modules/Usuarios/UsuarioCard.jsx');
  assert.match(peopleSource, /Histórico de inativos/);
  assert.match(peopleSource, /motivoInativacao/);
  assert.match(usersSource, /Acessos revogados/);
  assert.match(userCardSource, /motivoRevogacao/);
});

test('manutenção de CPF verifica antes de criar índices ausentes', () => {
  const source = readSource('../src/modules/Configuracoes/ConfiguracoesModule.jsx');
  assert.match(source, /Verificar índices de CPF/);
  assert.match(source, /Criar índices ausentes/);
  assert.match(source, /nenhum índice existente será sobrescrito/);
});

test('build separa autenticação, banco e base Firebase para cache independente', () => {
  const source = readSource('../vite.config.js');
  assert.match(source, /firebase-firestore/);
  assert.match(source, /firebase-auth/);
  assert.match(source, /firebase-platform/);
});

test('alterações administrativas de acesso usam função protegida no servidor', () => {
  const source = readSource('../src/modules/Usuarios/UsuariosModule.jsx');
  assert.match(source, /updateUserAccessOnServer/);
  assert.match(source, /createAccessAuthorizationOnServer/);
  assert.match(source, /EMAIL_MEMBRO_AMBIGUO/);
  assert.match(source, /último Administrador ativo/);
  assert.doesNotMatch(source, /batch\.update\(getAppDoc\('usuarios'/);
});

test('suspensão de membro não exibe sucesso de login nem erro técnico de permissão', () => {
  const source = readSource('../src/App.jsx');
  assert.doesNotMatch(source, /Login realizado com sucesso/);
  assert.match(source, /error\?\.code === 'permission-denied'.*pessoaAtiva: false/s);
});

test('Usuários separa acessos ativos, membros inativos e vínculos inválidos', () => {
  const moduleSource = readSource('../src/modules/Usuarios/UsuariosModule.jsx');
  const cardSource = readSource('../src/modules/Usuarios/UsuarioCard.jsx');
  assert.match(moduleSource, /\['suspensos', 'Membro inativo'\]/);
  assert.match(moduleSource, /\['vinculo-invalido', 'Vínculo inválido'\]/);
  assert.match(moduleSource, /Boolean\(pessoas\[item\.pessoaBaseId\]\)/);
  assert.match(moduleSource, /action: 'link'/);
  assert.match(cardSource, /hasBrokenLink/);
  assert.match(cardSource, /Reparar vínculo/);
});

test('Configurações verifica e repara vínculos de acesso sem excluir índices automaticamente', () => {
  const configSource = readSource('../src/modules/Configuracoes/ConfiguracoesModule.jsx');
  const panelSource = readSource('../src/modules/Configuracoes/AccessIntegrityPanel.jsx');
  assert.match(configSource, /AccessIntegrityPanel/);
  assert.match(panelSource, /Verificar integridade dos acessos/);
  assert.match(panelSource, /action: 'link'/);
  assert.match(panelSource, /nada foi excluído automaticamente/);
  assert.match(panelSource, /e-mail\(s\) duplicado\(s\)/);
  assert.match(panelSource, /Compare os cadastros, corrija o e-mail incorreto/);
  assert.match(panelSource, /Abrir cadastro/);
  assert.match(panelSource, /execute uma nova verificação/);
  assert.match(configSource, /onOpenPerson/);
  assert.match(panelSource, /window\.confirm/);
});

test('Pessoas avisa quando a inativação suspenderá uma conta vinculada', () => {
  const source = readSource('../src/modules/Pessoas/PessoasModule.jsx');
  assert.match(source, /usuario_pessoa_index/);
  assert.match(source, /o acesso ao sistema será suspenso imediatamente/);
  assert.match(source, /linkedAccessStatus === 'loading'/);
});

test('Pessoas explica o efeito da reativação conforme a conta vinculada', () => {
  const source = readSource('../src/modules/Pessoas/PessoasModule.jsx');
  assert.match(source, /linked-active/);
  assert.match(source, /linked-revoked/);
  assert.match(source, /o acesso ao sistema será restabelecido imediatamente/);
  assert.match(source, /reativado separadamente em Usuários/);
});

test('manutenção de e-mail dos Membros preserva conflitos e só cria índices ausentes', () => {
  const configSource = readSource('../src/modules/Configuracoes/ConfiguracoesModule.jsx');
  const functionSource = readSource('../functions/index.js');
  assert.match(configSource, /Verificar índices de e-mail dos Membros/);
  assert.match(configSource, /Criar índices de e-mail ausentes/);
  assert.match(configSource, /nenhum e-mail ou índice existente será sobrescrito/);
  assert.match(functionSource, /rebuildMemberEmailIndexSecure/);
  assert.match(functionSource, /MEMBRO_EMAIL_INDEX_RECONSTRUIDO/);
});

test('Pessoas impede e-mail duplicado de Membro antes e durante o salvamento', () => {
  const source = readSource('../src/modules/Pessoas/PessoasModule.jsx');
  const functionsSource = readSource('../src/services/firebaseFunctions.js');
  assert.match(source, /Este e-mail já pertence ao Membro/);
  assert.match(source, /savePersonWithUniqueEmailOnServer/);
  assert.match(source, /updateMemberLifecycleOnServer/);
  assert.match(functionsSource, /savePersonWithUniqueEmail/);
  assert.match(functionsSource, /updateMemberLifecycleSecure/);
});

test('aprovação de convite e link também bloqueia e-mail de Membro já ativo', () => {
  const serviceSource = readSource('../src/services/firebase.js');
  const reviewSource = readSource('../src/modules/Autocadastros/AutocadastrosModule.jsx');
  assert.match(serviceSource, /assertNoActiveMemberEmailConflict/);
  assert.match(serviceSource, /membro_email_index/);
  assert.match(reviewSource, /EMAIL_MEMBRO_DUPLICADO/);
});

test('histórico de usuário apresenta mudanças de perfil com valores legíveis', () => {
  const source = readSource('../src/components/audit/LifecycleHistoryModal.jsx');
  assert.match(source, /USUARIO_ROLE_ALTERADO: 'Perfil alterado'/);
  assert.match(source, /ROLE_LABELS\[event\.valorAnterior\]/);
  assert.match(source, /ROLE_LABELS\[event\.valorNovo\]/);
});

test('histórico administrativo possui filtros, carregamento e nova tentativa', () => {
  const source = readSource('../src/components/audit/LifecycleHistoryModal.jsx');
  assert.match(source, /\['role', 'Perfis'\]/);
  assert.match(source, /\['access', 'Acessos'\]/);
  assert.match(source, /Carregando histórico/);
  assert.match(source, /Não foi possível carregar o histórico/);
  assert.match(source, /Tentar novamente/);
  assert.match(source, /Responsável:/);
});

test('histórico administrativo carrega eventos anteriores por páginas', () => {
  const source = readSource('../src/components/audit/LifecycleHistoryModal.jsx');
  assert.match(source, /PAGE_SIZE = 20/);
  assert.match(source, /orderBy\('criadoEm', 'desc'\)/);
  assert.match(source, /startAfter\(cursor\)/);
  assert.match(source, /Carregar eventos anteriores/);
});

test('Painel oferece indicadores e atalhos para situações de acesso', () => {
  const homeSource = readSource('../src/modules/Home/HomeModule.jsx');
  const appSource = readSource('../src/App.jsx');
  assert.match(homeSource, /Acessos suspensos/);
  assert.match(homeSource, /Acessos revogados/);
  assert.match(homeSource, /onOpenUsers\('suspensos'\)/);
  assert.match(homeSource, /onOpenUsers\('inativos'\)/);
  assert.match(appSource, /openUsersByFilter/);
});

test('fluxos administrativos usam mensagens amigáveis centralizadas', () => {
  const usersSource = readSource('../src/modules/Usuarios/UsuariosModule.jsx');
  const peopleSource = readSource('../src/modules/Pessoas/PessoasModule.jsx');
  const historySource = readSource('../src/components/audit/LifecycleHistoryModal.jsx');
  assert.match(usersSource, /getFriendlyErrorMessage/);
  assert.match(peopleSource, /getFriendlyErrorMessage/);
  assert.match(historySource, /getFriendlyErrorMessage/);
});

test('Usuários explica impactos e bloqueia ações administrativas repetidas', () => {
  const moduleSource = readSource('../src/modules/Usuarios/UsuariosModule.jsx');
  const cardSource = readSource('../src/modules/Usuarios/UsuarioCard.jsx');
  assert.match(moduleSource, /ROLE_IMPACT/);
  assert.match(moduleSource, /O vínculo e o histórico serão preservados/);
  assert.match(moduleSource, /Conta legada sem Membro vinculado/);
  assert.match(moduleSource, /busy=\{saving\}/);
  assert.match(cardSource, /Vincule um Membro antes de alterar o perfil/);
  assert.match(cardSource, /disabled=\{busy \|\| isOwnAccount/);
});

test('sessão inválida encerra o acesso sem manter dados antigos na tela', () => {
  const source = readSource('../src/App.jsx');
  assert.match(source, /invalidSessionClosing/);
  assert.match(source, /setProfile\(null\)/);
  assert.match(source, /Sua sessão perdeu a validade\. Entre novamente para continuar/);
  assert.match(source, /Não foi possível acompanhar seu perfil de acesso\. Verifique sua conexão/);
});

test('estado de conexão orienta o usuário e confirma a retomada', () => {
  const statusSource = readSource('../src/components/ui/ConnectionStatus.jsx');
  const appSource = readSource('../src/App.jsx');
  assert.match(statusSource, /addEventListener\('offline'/);
  assert.match(statusSource, /addEventListener\('online'/);
  assert.match(statusSource, /Evite repetir operações/);
  assert.match(statusSource, /Conexão restabelecida\. O sistema voltou a sincronizar/);
  assert.match(statusSource, /role="alert"/);
  assert.match(appSource, /<ConnectionStatus\/>/);
});

test('confirmações direcionam o foco para a opção segura e restauram a navegação', () => {
  const modalSource = readSource('../src/components/ui/Modal.jsx');
  const confirmSource = readSource('../src/components/ui/ConfirmDialog.jsx');
  const buttonSource = readSource('../src/components/ui/Button.jsx');
  assert.match(modalSource, /initialFocusRef\?\.current/);
  assert.match(modalSource, /previousFocus\?\.focus/);
  assert.match(modalSource, /e\.key === 'Escape'/);
  assert.match(confirmSource, /initialFocusRef=\{cancelRef\}/);
  assert.match(confirmSource, /ref=\{cancelRef\}/);
  assert.match(buttonSource, /forwardRef/);
});

test('notificações ignoram duplicatas e limitam o acúmulo visual', () => {
  const source = readSource('../src/components/ui/Toast.jsx');
  assert.match(source, /MAX_VISIBLE_TOASTS = 4/);
  assert.match(source, /toast\.message === normalizedMessage && toast\.type === type/);
  assert.match(source, /slice\(-MAX_VISIBLE_TOASTS\)/);
  assert.match(source, /if \(!normalizedMessage\) return/);
});

test('título da aba identifica módulo e ambiente atual', () => {
  const appSource = readSource('../src/App.jsx');
  const permissionsSource = readSource('../src/constants/permissions.js');
  assert.match(permissionsSource, /export const MODULE_LABELS/);
  assert.match(appSource, /AUTH_VIEW\.AUTHORIZED \? MODULE_LABELS\[tab\]/);
  assert.match(appSource, /document\.title = `\$\{page/);
  assert.match(appSource, /import\.meta\.env\.MODE === 'hml'/);
  assert.match(appSource, /Autocadastro/);
  assert.match(appSource, /Ativação de acesso/);
});

test('navegação normaliza endereços inválidos sem contornar permissões', () => {
  const appSource = readSource('../src/App.jsx');
  const permissionsSource = readSource('../src/constants/permissions.js');
  assert.match(permissionsSource, /Object\.values\(MODULES\)\.includes\(segment\)/);
  assert.match(appSource, /canonicalPath/);
  assert.match(appSource, /history\.replaceState/);
  assert.match(appSource, /!canAccessModule\(profile, tab\)/);
});

test('menus identificam a página atual e exibem foco de teclado', () => {
  for (const file of ['../src/components/layout/Sidebar.jsx', '../src/components/layout/MobileNav.jsx']) {
    const source = readSource(file);
    assert.match(source, /aria-label="Navegação principal"/);
    assert.match(source, /aria-current=\{isActive \? 'page'/);
    assert.match(source, /focus-visible:ring-2/);
  }
});

test('menu móvel preserva área de toque e mantém módulo ativo visível', () => {
  const source = readSource('../src/components/layout/MobileNav.jsx');
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /min-w-\[4\.75rem\]/);
  assert.match(source, /min-h-12/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /inline: 'center'/);
});

test('formulários principais protegem alterações ainda não salvas', () => {
  const hookSource = readSource('../src/hooks/useUnsavedChanges.js');
  const appSource = readSource('../src/App.jsx');
  const personSource = readSource('../src/components/pessoas/PessoaFormModal.jsx');
  const myRegistrationSource = readSource('../src/modules/MeuCadastro/MeuCadastroModule.jsx');
  assert.match(hookSource, /beforeunload/);
  assert.match(hookSource, /Existem alterações não salvas/);
  assert.match(appSource, /UNSAVED_NAVIGATION_EVENT/);
  assert.match(personSource, /useUnsavedChanges/);
  assert.match(myRegistrationSource, /useUnsavedChanges/);
});

test('componentes essenciais acomodam textos longos em telas pequenas', () => {
  const modalSource = readSource('../src/components/ui/Modal.jsx');
  const buttonSource = readSource('../src/components/ui/Button.jsx');
  const toastSource = readSource('../src/components/ui/Toast.jsx');
  const confirmSource = readSource('../src/components/ui/ConfirmDialog.jsx');
  const userCardSource = readSource('../src/modules/Usuarios/UsuarioCard.jsx');
  assert.match(modalSource, /overflow-wrap:anywhere/);
  assert.match(buttonSource, /whitespace-normal/);
  assert.match(toastSource, /inset-x-3/);
  assert.match(confirmSource, /grid-cols-1.*sm:grid-cols-2/);
  assert.doesNotMatch(userCardSource, /text-gray-900 truncate/);
});

test('carregamentos e operações exibem estado visual e semântico consistente', () => {
  const buttonSource = readSource('../src/components/ui/Button.jsx');
  const loadSource = readSource('../src/components/ui/DataLoadState.jsx');
  const confirmSource = readSource('../src/components/ui/ConfirmDialog.jsx');
  assert.match(buttonSource, /aria-busy=\{busy \|\| undefined\}/);
  assert.match(buttonSource, /LoaderCircle/);
  assert.match(buttonSource, /disabled=\{disabled \|\| busy\}/);
  assert.match(loadSource, /animate-spin/);
  assert.match(loadSource, /aria-live="polite"/);
  assert.match(confirmSource, /busy=\{busy\}/);
});

test('navegação oferece salto ao conteúdo e respeita redução de movimento', () => {
  const appSource = readSource('../src/App.jsx');
  const cssSource = readSource('../src/index.css');
  const mobileSource = readSource('../src/components/layout/MobileNav.jsx');
  assert.match(appSource, /href="#main-content"/);
  assert.match(appSource, /id="main-content"/);
  assert.match(cssSource, /prefers-reduced-motion: reduce/);
  assert.match(cssSource, /animation-duration: 0\.01ms/);
  assert.match(mobileSource, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
});
