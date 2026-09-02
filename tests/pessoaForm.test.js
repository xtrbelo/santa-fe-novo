import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPessoaPayload, createEmptyMemberDetails, getBatizadoCaesf, getEffectiveMemberFunctions, getMemberFunctionLabels, getPessoaStatusCadastro, isValidOrigemCadastro, isValidStatusCadastro, localTextIncludes, normalizeDadosCasa, normalizeEmail, normalizeEndereco, validatePessoaPayload } from '../src/utils/pessoaForm.js';
import { formatDateBr, getBatizadoCaesfLabel, getDetailLabel, NAO_INFORMADO } from '../src/utils/pessoaDetails.js';

test('cria Membro canônico com dados complementares e funções', () => {
  const pessoa = buildPessoaPayload({ vinculo: 'membro', nome: ' Maria ', cpf: '123', email: ' MARIA@EMAIL.COM ', sexo: 'feminino', estadoCivil: 'casado', endereco: { cep: '68900-000', cidade: ' Macapá ', uf: 'ap' }, dadosCasa: { dataIngresso: '2020-01-02' }, funcoesCasa: ['medium', 'cambone', 'medium'] });
  assert.equal(pessoa.vinculo, 'membro'); assert.equal(pessoa.tipoPessoa, 'Membro'); assert.equal(pessoa.email, 'maria@email.com');
  assert.deepEqual(pessoa.funcoesCasa, ['medium', 'cambone']); assert.equal(pessoa.sexo, 'feminino'); assert.equal(pessoa.estadoCivil, 'casado');
  assert.deepEqual(pessoa.endereco, { cep: '68900000', logradouro: null, numero: null, complemento: null, bairro: null, cidade: 'Macapá', uf: 'AP' });
  assert.deepEqual(pessoa.dadosCasa, { dataIngresso: '2020-01-02', batizadoCaesf: null, dataBatismoCaesf: null });
  assert.equal(pessoa.statusCadastro, 'aprovado'); assert.equal(pessoa.origemCadastro, 'administrativo'); assert.equal(validatePessoaPayload(pessoa), null);
});

test('Consulente mantém fluxo simples sem campos exclusivos de Membro', () => {
  const pessoa = buildPessoaPayload({ vinculo: 'consulente', nome: 'Ana', funcoesCasa: ['medium'], sexo: 'feminino', endereco: { cidade: 'Macapá' }, dadosCasa: { dataIngresso: '2020-01-01' } });
  assert.equal(pessoa.tipoPessoa, 'Consulente'); assert.equal(pessoa.email, null); assert.deepEqual(pessoa.funcoesCasa, []);
  assert.equal(Object.hasOwn(pessoa, 'sexo'), false); assert.equal(Object.hasOwn(pessoa, 'endereco'), false); assert.equal(Object.hasOwn(pessoa, 'dadosCasa'), false);
});

test('Membro exige CPF, aceita ausência de e-mail e recusa e-mail inválido', () => {
  assert.match(validatePessoaPayload({ vinculo: 'membro', nome: 'A', email: 'a@b.com' }), /CPF/);
  assert.equal(validatePessoaPayload({ vinculo: 'membro', nome: 'A', cpf: '1' }), null);
  assert.equal(buildPessoaPayload({ vinculo: 'membro', nome: 'A', cpf: '1' }).email, null);
  assert.match(validatePessoaPayload({ vinculo: 'membro', nome: 'A', cpf: '1', email: 'inválido' }), /válido/);
});

test('normaliza CEP, UF e textos de endereço', () => {
  assert.deepEqual(normalizeEndereco({ cep: '68.900-000', logradouro: ' Rua A ', numero: ' 10 ', complemento: ' ', bairro: ' Centro ', cidade: ' Macapá ', uf: ' ap ' }), { cep: '68900000', logradouro: 'Rua A', numero: '10', complemento: null, bairro: 'Centro', cidade: 'Macapá', uf: 'AP' });
});
test('recusa CEP e UF inválidos', () => {
  assert.match(validatePessoaPayload({ vinculo: 'membro', nome: 'A', cpf: '1', endereco: { cep: '123' } }), /CEP/);
  assert.match(validatePessoaPayload({ vinculo: 'membro', nome: 'A', cpf: '1', endereco: { uf: 'A1' } }), /UF/);
});
test('Membro legado recebe valores seguros para renderização', () => {
  const details = createEmptyMemberDetails({ tipoPessoa: 'Membro', nome: 'Legado' });
  assert.equal(details.sexo, 'nao_informado'); assert.equal(details.estadoCivil, 'nao_informado'); assert.equal(details.endereco.cep, null); assert.equal(details.dadosCasa.dataIngresso, null); assert.equal(details.statusCadastro, 'aprovado'); assert.equal(details.origemCadastro, 'administrativo'); assert.equal(getPessoaStatusCadastro({ tipoPessoa: 'Membro' }), 'aprovado');
});
test('valida os estados cadastrais previstos', () => {
  assert.equal(isValidStatusCadastro('aprovado'), true); assert.equal(isValidStatusCadastro('aguardando_validacao'), true); assert.equal(isValidStatusCadastro('desconhecido'), false); assert.equal(isValidOrigemCadastro('administrativo'), true); assert.equal(isValidOrigemCadastro('autocadastro'), true); assert.equal(isValidOrigemCadastro('desconhecida'), false);
});
test('preserva status e origem existentes ao reconstruir payload de edição', () => {
  const current = { vinculo: 'membro', nome: 'Em validação', cpf: '123', statusCadastro: 'aguardando_validacao', origemCadastro: 'autocadastro' };
  const rebuilt = buildPessoaPayload({ ...current, ...createEmptyMemberDetails(current), contato: '96999999999' });
  assert.equal(rebuilt.statusCadastro, 'aguardando_validacao'); assert.equal(rebuilt.origemCadastro, 'autocadastro');
});
test('aplica defaults somente quando status e origem estão ausentes e rejeita valores explícitos inválidos', () => {
  const defaults = buildPessoaPayload({ vinculo: 'membro', nome: 'Novo', cpf: '123', statusCadastro: null, origemCadastro: null });
  assert.equal(defaults.statusCadastro, 'aprovado'); assert.equal(defaults.origemCadastro, 'administrativo');
  assert.match(validatePessoaPayload({ vinculo: 'membro', nome: 'A', cpf: '1', statusCadastro: 'qualquer_coisa' }), /Status cadastral/);
  assert.match(validatePessoaPayload({ vinculo: 'membro', nome: 'A', cpf: '1', origemCadastro: 'qualquer_coisa' }), /Origem cadastral/);
});
test('busca local ignora acentos, caixa e espaços extras', () => {
  assert.equal(localTextIncludes('João Paulo Belo', 'joao'), true); assert.equal(localTextIncludes('João Paulo Belo', ' JOÃO   PAULO '), true); assert.equal(localTextIncludes('JOÃO   PAULO', 'joao paulo'), true); assert.equal(normalizeEmail(' JOAO@EMAIL.COM '), 'joao@email.com');
});
test('funções efetivas sempre incluem Médium e Cambone e acrescentam personalizadas', () => {
  assert.deepEqual(getEffectiveMemberFunctions([]).map(item => item.nome), ['Médium', 'Cambone']); assert.deepEqual(getEffectiveMemberFunctions([{ codigo: 'dirigente', nome: 'Dirigente', ativo: true }]).map(item => item.nome), ['Médium', 'Cambone', 'Dirigente']);
});
test('funções efetivas ignoram inativas e configuração substitui nome sem duplicar código', () => {
  const effective = getEffectiveMemberFunctions([{ codigo: 'medium', nome: 'Médium da Casa', ativo: true }, { codigo: 'inativa', nome: 'Inativa', ativo: false }]); assert.deepEqual(effective.map(item => item.id), ['medium', 'cambone']); assert.deepEqual(getMemberFunctionLabels(['medium', 'cambone'], effective), ['Médium da Casa', 'Cambone']);
});
test('funções efetivas aceitam legado, removem inativas e usam código normalizado', () => {
  const effective = getEffectiveMemberFunctions([{ id: 'doc-medium', codigo: 'medium', nome: 'Médium', ativo: true }, { id: 'doc-cambone', slug: 'cambone', nome: 'Cambone' }, { id: 'sem-funcao', codigo: 'sem_funcao', nome: 'Sem função' }, { id: 'desativada', codigo: 'desativada', nome: 'Desativada', ativo: false }]);
  assert.deepEqual(effective.map(item => [item.id, item.nome]), [['medium', 'Médium'], ['cambone', 'Cambone'], ['sem_funcao', 'Sem função']]);
  assert.deepEqual(getEffectiveMemberFunctions([{ codigo: 'medium', nome: 'Médium', ativo: false }]).map(item => item.id), ['cambone']);
});
test('label de função personalizada usa o nome configurado', () => { assert.deepEqual(getMemberFunctionLabels(['dirigente'], [{ codigo: 'dirigente', nome: 'Dirigente' }]), ['Dirigente']); });

test('normaliza Membro batizado e preserva a data opcional', () => {
  assert.deepEqual(normalizeDadosCasa({ dataIngresso: '2020-01-01', batizadoCaesf: true, dataBatismoCaesf: '2021-02-03' }), { dataIngresso: '2020-01-01', batizadoCaesf: true, dataBatismoCaesf: '2021-02-03' });
  assert.deepEqual(normalizeDadosCasa({ batizadoCaesf: true }), { dataIngresso: null, batizadoCaesf: true, dataBatismoCaesf: null });
});

test('selecionar Não limpa uma data de batismo anteriormente preenchida', () => {
  assert.deepEqual(normalizeDadosCasa({ batizadoCaesf: false, dataBatismoCaesf: '2021-02-03' }), { dataIngresso: null, batizadoCaesf: false, dataBatismoCaesf: null });
});

test('interpreta corretamente dados de batismo legados', () => {
  assert.equal(getBatizadoCaesf({ dataBatismoCaesf: '2021-02-03' }), true);
  assert.equal(getBatizadoCaesf({}), null);
  assert.equal(getBatizadoCaesf(null), null);
});

test('Consulente continua sem dados da Casa no payload', () => {
  const pessoa = buildPessoaPayload({ vinculo: 'consulente', nome: 'Ana', dadosCasa: { batizadoCaesf: true, dataBatismoCaesf: '2021-02-03' } });
  assert.equal(Object.hasOwn(pessoa, 'dadosCasa'), false);
});

test('formata valores do detalhe com labels amigáveis e datas brasileiras', () => {
  assert.equal(formatDateBr('2024-12-31'), '31/12/2024');
  assert.equal(formatDateBr(null), NAO_INFORMADO);
  assert.equal(getDetailLabel('aguardando_validacao'), 'Aguardando validação');
  assert.equal(getBatizadoCaesfLabel({ dataBatismoCaesf: '2021-02-03' }), 'Sim');
  assert.equal(getBatizadoCaesfLabel({ batizadoCaesf: false }), 'Não');
  assert.equal(getBatizadoCaesfLabel({}), NAO_INFORMADO);
});
