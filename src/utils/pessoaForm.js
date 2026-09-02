import { normalizeSearchText } from './pessoaSearch.js';

export const FALLBACK_FUNCOES_MEMBRO = [{ id: 'medium', nome: 'Médium' }, { id: 'cambone', nome: 'Cambone' }];
export const SEXOS = ['masculino', 'feminino', 'outro', 'nao_informado'];
export const ESTADOS_CIVIS = ['solteiro', 'casado', 'uniao_estavel', 'separado', 'divorciado', 'viuvo', 'outro', 'nao_informado'];
export const STATUS_CADASTRO = ['convite_enviado', 'preenchendo', 'aguardando_validacao', 'correcao_solicitada', 'aprovado', 'rejeitado'];
export const ORIGENS_CADASTRO = ['administrativo', 'autocadastro'];

export const getEffectiveMemberFunctions = configuredFunctions => {
  const byId = new Map(FALLBACK_FUNCOES_MEMBRO.map(item => [item.id, { ...item }]));
  (configuredFunctions || []).forEach(item => {
    const id = String(item.codigo || item.slug || item.id || '').trim();
    if (!id) return;
    if (item.ativo === false) byId.delete(id);
    else if (item.nome) byId.set(id, { id, nome: String(item.nome).trim() });
  });
  return [...byId.values()];
};

export const getMemberFunctionLabels = (codes, effectiveFunctions) => {
  const labels = new Map(getEffectiveMemberFunctions(effectiveFunctions).map(item => [item.id, item.nome]));
  return (codes || []).map(code => labels.get(code) || code);
};

export const normalizeEmail = value => String(value || '').trim().toLowerCase();
export const isValidEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
const nullableText = value => String(value ?? '').trim() || null;
const normalizeOption = (value, allowed, fallback = 'nao_informado') => allowed.includes(value) ? value : fallback;

export const normalizeSexo = value => normalizeOption(value, SEXOS);
export const normalizeEstadoCivil = value => normalizeOption(value, ESTADOS_CIVIS);
export const isValidStatusCadastro = value => STATUS_CADASTRO.includes(value);
export const isValidOrigemCadastro = value => ORIGENS_CADASTRO.includes(value);
export const getPessoaStatusCadastro = pessoa => pessoa?.statusCadastro || 'aprovado';
export const normalizeEndereco = endereco => ({
  cep: String(endereco?.cep ?? '').replace(/\D/g, '') || null,
  logradouro: nullableText(endereco?.logradouro), numero: nullableText(endereco?.numero),
  complemento: nullableText(endereco?.complemento), bairro: nullableText(endereco?.bairro),
  cidade: nullableText(endereco?.cidade), uf: nullableText(endereco?.uf)?.toUpperCase() || null,
});
export const getBatizadoCaesf = dadosCasa => {
  if (typeof dadosCasa?.batizadoCaesf === 'boolean') return dadosCasa.batizadoCaesf;
  return nullableText(dadosCasa?.dataBatismoCaesf) ? true : null;
};
export const normalizeDadosCasa = dadosCasa => {
  const batizadoCaesf = getBatizadoCaesf(dadosCasa);
  return {
    dataIngresso: nullableText(dadosCasa?.dataIngresso),
    batizadoCaesf,
    dataBatismoCaesf: batizadoCaesf === false ? null : nullableText(dadosCasa?.dataBatismoCaesf),
  };
};
export const createEmptyMemberDetails = pessoa => ({
  sexo: normalizeSexo(pessoa?.sexo), estadoCivil: normalizeEstadoCivil(pessoa?.estadoCivil),
  endereco: normalizeEndereco(pessoa?.endereco), dadosCasa: normalizeDadosCasa(pessoa?.dadosCasa),
  statusCadastro: pessoa?.statusCadastro ?? 'aprovado', origemCadastro: pessoa?.origemCadastro ?? 'administrativo',
});

export const buildPessoaPayload = data => {
  const vinculo = data.vinculo === 'membro' ? 'membro' : 'consulente';
  const { sexo, estadoCivil, endereco, dadosCasa, statusCadastro, origemCadastro, ...sharedData } = data;
  const payload = { ...sharedData, vinculo, tipoPessoa: vinculo === 'membro' ? 'Membro' : 'Consulente', funcoesCasa: vinculo === 'membro' ? [...new Set(data.funcoesCasa || [])] : [], nome: String(data.nome || '').trim(), email: normalizeEmail(data.email) || null };
  if (vinculo === 'membro') Object.assign(payload, {
    sexo: normalizeSexo(sexo), estadoCivil: normalizeEstadoCivil(estadoCivil), endereco: normalizeEndereco(endereco), dadosCasa: normalizeDadosCasa(dadosCasa),
    statusCadastro: statusCadastro ?? 'aprovado', origemCadastro: origemCadastro ?? 'administrativo',
  });
  return payload;
};

export const validatePessoaPayload = data => {
  const pessoa = buildPessoaPayload(data);
  if (!pessoa.nome) return 'O nome é obrigatório.';
  if (pessoa.vinculo === 'membro' && !pessoa.cpf) return 'O CPF é obrigatório para Membro.';
  if (pessoa.email && !isValidEmail(pessoa.email)) return 'Informe um e-mail válido.';
  if (pessoa.vinculo === 'membro' && !isValidStatusCadastro(pessoa.statusCadastro)) return 'Status cadastral inválido.';
  if (pessoa.vinculo === 'membro' && !isValidOrigemCadastro(pessoa.origemCadastro)) return 'Origem cadastral inválida.';
  if (pessoa.vinculo === 'membro' && pessoa.endereco.cep && pessoa.endereco.cep.length !== 8) return 'Informe um CEP com 8 dígitos.';
  if (pessoa.vinculo === 'membro' && pessoa.endereco.uf && !/^[A-Z]{2}$/.test(pessoa.endereco.uf)) return 'Informe uma UF com 2 letras.';
  const dates = pessoa.vinculo === 'membro' ? [pessoa.dadosCasa.dataIngresso, pessoa.dadosCasa.dataBatismoCaesf] : [];
  if (dates.some(value => value && !/^\d{4}-\d{2}-\d{2}$/.test(value))) return 'Informe as datas no formato AAAA-MM-DD.';
  return null;
};

export const localTextIncludes = (value, term) => normalizeSearchText(value).includes(normalizeSearchText(term));
