const LOWERCASE_PARTICLES = new Set(['a', 'as', 'ao', 'aos', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'na', 'nas', 'no', 'nos', 'para', 'por']);

const capitalizeWord = word => word.replace(/(^|[-'])\p{L}/gu, value => value.toUpperCase());

export const normalizeDisplayText = value => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.toLocaleLowerCase('pt-BR').split(' ').map((word, index) => {
    if (index > 0 && word.length > 1 && LOWERCASE_PARTICLES.has(word)) return word;
    return capitalizeWord(word);
  }).join(' ');
};

export const normalizeDisplayName = normalizeDisplayText;
export const normalizeEmailText = value => String(value ?? '').trim().toLowerCase();

export const normalizeAddressText = address => ({
  ...(address || {}),
  logradouro: normalizeDisplayText(address?.logradouro) || null,
  numero: String(address?.numero ?? '').trim() || null,
  complemento: normalizeDisplayText(address?.complemento) || null,
  bairro: normalizeDisplayText(address?.bairro) || null,
  cidade: normalizeDisplayText(address?.cidade) || null,
  uf: String(address?.uf ?? '').trim().toUpperCase() || null,
});

const applyText = (target, key, normalizer = normalizeDisplayText) => {
  if (target[key] !== undefined && target[key] !== null) target[key] = normalizer(target[key]);
};

const applyAddress = target => {
  if (target.endereco && typeof target.endereco === 'object') target.endereco = normalizeAddressText(target.endereco);
};

const normalizeSearchText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const normalizeSearchDigits = value => String(value || '').replace(/\D/g, '');
const buildPessoaSearchIndex = pessoa => {
  const nome = normalizeSearchText(pessoa?.nome);
  const termos = new Set();
  const addPrefixes = (value, maximum) => { const limited = value.slice(0, maximum); for (let length = 2; length <= limited.length; length += 1) termos.add(limited.slice(0, length)); };
  nome.split(' ').filter(Boolean).forEach(word => addPrefixes(word, 20));
  addPrefixes(nome, 50);
  const cpf = normalizeSearchDigits(pessoa?.cpf); if (cpf) termos.add(cpf);
  const telefone = normalizeSearchDigits(pessoa?.contato || pessoa?.telefone);
  if (telefone) { termos.add(telefone); for (let length = Math.min(9, telefone.length - 1); length >= 4; length -= 1) termos.add(telefone.slice(-length)); }
  return { versao: 1, nome, telefone, termos: [...termos].slice(0, 180) };
};

const applyPeopleText = target => {
  applyText(target, 'nome', normalizeDisplayName);
  applyText(target, 'responsavelNome', normalizeDisplayName);
  applyText(target, 'pessoaNome', normalizeDisplayName);
  applyText(target, 'responsavelContato', value => String(value ?? '').replace(/\D/g, '') || null);
  applyText(target, 'email', normalizeEmailText);
  applyAddress(target);
};

export const normalizeCollectionData = (collectionName, data) => {
  const normalized = { ...(data || {}) };
  if (['pessoas', 'usuarios', 'convites_membro', 'autocadastros_membro', 'solicitacoes_cadastro'].includes(collectionName)) applyPeopleText(normalized);
  if (collectionName === 'pessoas') normalized.busca = buildPessoaSearchIndex(normalized);
  if (collectionName === 'links_autocadastro') applyText(normalized, 'nome', normalizeDisplayName);
  if (collectionName === 'config_funcoes_membro' || collectionName === 'config_eventos' || collectionName === 'config_servicos' || collectionName === 'config_grupos_trabalho') applyText(normalized, 'nome', normalizeDisplayName);
  if (collectionName === 'config_equipe_eventos') { applyText(normalized, 'nome', normalizeDisplayName); applyText(normalized, 'funcao', normalizeDisplayText); }
  if (collectionName === 'agendas') { applyText(normalized, 'tipoTrabalhoNome', normalizeDisplayText); applyText(normalized, 'tipo', normalizeDisplayText); }
  if (collectionName === 'consulentes') { applyText(normalized, 'nome', normalizeDisplayName); applyText(normalized, 'pessoaNome', normalizeDisplayName); applyText(normalized, 'tipoTrabalhoNome', normalizeDisplayText); applyText(normalized, 'tipo', normalizeDisplayText); }
  if (collectionName === 'livro_mediunico_registros') { applyText(normalized, 'trabalho', normalizeDisplayText); applyText(normalized, 'dirigenteResponsavel', normalizeDisplayName); }
  if (collectionName === 'membro_email_index') applyText(normalized, 'email', normalizeEmailText);
  return normalized;
};

export const CASE_NORMALIZATION_COLLECTIONS = Object.freeze([
  'pessoas', 'usuarios', 'convites_membro', 'autocadastros_membro', 'solicitacoes_cadastro', 'links_autocadastro',
  'config_funcoes_membro', 'config_eventos', 'config_servicos', 'config_grupos_trabalho', 'config_equipe_eventos',
  'agendas', 'consulentes', 'livro_mediunico_registros', 'membro_email_index',
]);

export const buildCollectionPatch = (collectionName, data) => {
  const normalized = normalizeCollectionData(collectionName, data);
  const patch = {};
  Object.keys(normalized).forEach(key => {
    if (JSON.stringify(normalized[key]) !== JSON.stringify(data?.[key])) patch[key] = normalized[key];
  });
  return patch;
};
