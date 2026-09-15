import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getModuleFromPathname, MODULES } from '../src/constants/permissions.js';

const readSource = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('endereços antigos de convites e autocadastros abrem o módulo integrado', () => {
  assert.equal(getModuleFromPathname('/convites'), MODULES.PEOPLE);
  assert.equal(getModuleFromPathname('/autocadastros'), MODULES.PEOPLE);
});

test('central reúne Pessoas, Links e Solicitações sem exibir Convites', () => {
  const source = readSource('../src/modules/Pessoas/PessoasCadastrosModule.jsx');
  assert.match(source, /Pessoas e Cadastros/);
  assert.match(source, /PERMISSIONS\.PEOPLE_VIEW/);
  assert.match(source, /PERMISSIONS\.MEMBER_INVITES_MANAGE/);
  assert.match(source, /PERMISSIONS\.MEMBER_REGISTRATIONS_REVIEW/);
  assert.match(source, /<PessoasModule/);
  assert.match(source, /<AutocadastrosModule/);
  assert.match(source, /<LinksCadastroModule/);
  assert.doesNotMatch(source, /ConvitesModule/);
  assert.doesNotMatch(source, /id: 'convites'/);
});

test('endereço antigo de Convites direciona para Links sem apagar o histórico', () => {
  const hubSource = readSource('../src/modules/Pessoas/PessoasCadastrosModule.jsx');
  const appSource = readSource('../src/App.jsx');
  assert.match(hubSource, /pathname === '\/convites'.*return 'links'/);
  assert.match(appSource, /pathname === '\/convites' \? 'links'/);
});

test('menus principais exibem somente a entrada integrada', () => {
  for (const file of ['../src/components/layout/Sidebar.jsx', '../src/components/layout/MobileNav.jsx']) {
    const source = readSource(file);
    assert.match(source, /id: 'pessoas'/);
    assert.doesNotMatch(source, /id: 'convites'/);
    assert.doesNotMatch(source, /id: 'autocadastros'/);
  }
});

test('fila de solicitações separa Membros e Consulentes com filtros e contadores', () => {
  const source = readSource('../src/modules/Autocadastros/AutocadastrosModule.jsx');
  assert.match(source, /typeFilters/);
  assert.match(source, /typeCounts/);
  assert.match(source, /Consulentes/);
  assert.match(source, /consultee \? 'Consulente' : 'Membro'/);
});

test('aprovação de Membro solicita somente a função na Casa', () => {
  const source = readSource('../src/modules/Autocadastros/AutocadastrosModule.jsx');
  assert.match(source, /Definir função na Casa/);
  assert.doesNotMatch(source, /updateHouseData/);
  assert.doesNotMatch(source, /Completar aprovação/);
});

test('solicitação aprovada abre diretamente a Pessoa criada', () => {
  const hubSource = readSource('../src/modules/Pessoas/PessoasCadastrosModule.jsx');
  const requestSource = readSource('../src/modules/Autocadastros/AutocadastrosModule.jsx');
  const peopleSource = readSource('../src/modules/Pessoas/PessoasModule.jsx');
  assert.match(requestSource, /Pessoa criada/);
  assert.match(requestSource, /Abrir em Pessoas/);
  assert.match(requestSource, /onOpenPerson\?\.\(selected\.pessoaId\)/);
  assert.match(hubSource, /focusPersonId/);
  assert.match(peopleSource, /setSelectedPerson\(pessoa\)/);
});

test('pendências aparecem na aba e no Painel com acesso direto', () => {
  const hubSource = readSource('../src/modules/Pessoas/PessoasCadastrosModule.jsx');
  const homeSource = readSource('../src/modules/Home/HomeModule.jsx');
  const appSource = readSource('../src/App.jsx');
  assert.match(hubSource, /pendingRegistrations/);
  assert.match(homeSource, /Solicitações pendentes/);
  assert.match(homeSource, /registrationCounts\.membro/);
  assert.match(homeSource, /registrationCounts\.consulente/);
  assert.match(appSource, /secao=solicitacoes/);
});

test('CPF já cadastrado bloqueia nova aprovação e abre a Pessoa existente', () => {
  const source = readSource('../src/modules/Autocadastros/AutocadastrosModule.jsx');
  assert.match(source, /getAppDoc\('cpf_index', item\.cpf\)/);
  assert.match(source, /CPF já cadastrado/);
  assert.match(source, /Abrir Pessoa existente/);
  assert.match(source, /!!duplicatePersonId/);
  assert.match(source, /personSnapshot\?\.exists\(\)/);
});

test('solicitações têm busca, contadores filtrados e prioridade operacional', () => {
  const source = readSource('../src/modules/Autocadastros/AutocadastrosModule.jsx');
  assert.match(source, /Buscar por nome, CPF ou contato/);
  assert.match(source, /statusCounts/);
  assert.match(source, /compareRegistrationRequestsByPriority/);
  assert.match(source, /Nenhuma solicitação encontrada para esta busca/);
});

test('solicitações mostram tempo de espera e destacam atrasos', () => {
  const source = readSource('../src/modules/Autocadastros/AutocadastrosModule.jsx');
  assert.match(source, /Atrasadas \(/);
  assert.match(source, /Análise atrasada/);
  assert.match(source, /waiting\.label/);
});

test('Links exibem totais e abrem suas próprias solicitações filtradas', () => {
  const linksSource = readSource('../src/modules/LinksCadastro/LinksCadastroModule.jsx');
  const hubSource = readSource('../src/modules/Pessoas/PessoasCadastrosModule.jsx');
  const requestsSource = readSource('../src/modules/Autocadastros/AutocadastrosModule.jsx');
  assert.match(linksSource, /requestCounts/);
  assert.match(linksSource, /onOpenRequests\?\.\(item\.id\)/);
  assert.match(hubSource, /filteredLinkId/);
  assert.match(requestsSource, /item\.linkId === filterLinkId/);
  assert.match(requestsSource, /Limpar filtro/);
});

test('Links geram QR Code local com opções de baixar e imprimir', () => {
  const source = readSource('../src/modules/LinksCadastro/LinksCadastroModule.jsx');
  assert.match(source, /QRCode\.toDataURL/);
  assert.match(source, /Baixar PNG/);
  assert.match(source, /Imprimir/);
  assert.match(source, /REGISTRATION_LINK_TYPE_LABELS\[qrPreview\.item\.tipoCadastro\]/);
});

test('Links exibem histórico imutável de criação e alterações', () => {
  const source = readSource('../src/modules/LinksCadastro/LinksCadastroModule.jsx');
  const service = readSource('../src/services/firebase.js');
  assert.match(source, /links_autocadastro_historico/);
  assert.match(source, /> Histórico</);
  assert.match(service, /LINK_CRIADO/);
  assert.match(service, /LINK_EDITADO/);
  assert.match(service, /LINK_ATIVADO/);
  assert.match(service, /LINK_DESATIVADO/);
});

test('Links oferecem busca, filtros, contadores e priorização por atenção', () => {
  const source = readSource('../src/modules/LinksCadastro/LinksCadastroModule.jsx');
  assert.match(source, /Buscar link pelo nome/);
  assert.match(source, /Filtrar pelo tipo/);
  assert.match(source, /Filtrar pela situação/);
  assert.match(source, /linkCounters/);
  assert.match(source, /priority\(a\) - priority\(b\)/);
});

test('formulário público registra privacidade, declaração, código e comprovante', () => {
  const source = readSource('../src/modules/Autocadastro/ReusableRegistrationPage.jsx');
  assert.match(source, /Aviso de Privacidade/);
  assert.match(source, /declaracaoVeracidade/);
  assert.match(source, /requestRegistrationEmailCodeOnServer/);
  assert.match(source, /confirmRegistrationEmailCodeOnServer/);
  assert.match(source, /Comprovante do aceite/);
  const reviewSource = readSource('../src/modules/Autocadastros/AutocadastrosModule.jsx');
  assert.match(reviewSource, /Registro de aceite/);
  assert.match(reviewSource, /Resumo criptográfico/);
});
